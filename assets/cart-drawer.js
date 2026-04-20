import { DialogComponent } from '@theme/dialog';
import { CartAddEvent, ThemeEvents, CartUpdateEvent } from '@theme/events';
import { sectionRenderer } from '@theme/section-renderer';

/**
 * A custom element that manages a cart drawer.
 *
 * @extends {DialogComponent}
 */
class CartDrawerComponent extends DialogComponent {
  /** @type {Array<any>} */
  #cartGoals = [];
  #isProcessingGoals = false;
  /** @type {boolean} */
  #goalCountdownEnabled = false;
  /** @type {number} */
  #goalCountdownDurationMs = 0;
  /** @type {ReturnType<typeof setInterval> | null} */
  #goalCountdownInterval = null;
  /** @type {string} */
  #goalCountdownStorageKey = 'vera_lane_cart_goal_countdown_end_at';
  /** @type {HTMLElement | null} */
  #loadingElement = null;
  /** @type {any} */
  #cachedCartData = null;
  /** @type {Promise<any> | null} */
  #cartFetchPromise = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  #goalCheckTimeout = null;
  /** @type {Promise<void> | null} */
  #cartOperationLock = null;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    document.addEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdateEvent);
    this.addEventListener('click', this.#handleUpsellClick);
    this.#loadingElement = this.querySelector('.cart-drawer__loading');
    this.#loadCartGoals();
    this.#initGoalCountdown();
    // Bind shipping protection toggle on initial render (just UI binding)
    // КРИТИЧЕСКИ ВАЖНО: вызываем синхронно, чтобы _shippingProtectionVariantId
    // был установлен ДО первого события add-to-cart
    this.#bindShippingProtection();
    // Defer initial goals check to avoid blocking page load.
    // Use requestIdleCallback if available, otherwise setTimeout.
    const runInitialGoals = () => {
      this.#checkAndApplyGoals();
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(runInitialGoals, { timeout: 2000 });
    } else {
      setTimeout(runInitialGoals, 100);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    document.removeEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdateEvent);
    this.#stopGoalCountdownTicker();
    this.removeEventListener('click', this.#handleUpsellClick);
    
    // Clear any pending timeouts
    if (this.#goalCheckTimeout) {
      clearTimeout(this.#goalCheckTimeout);
      this.#goalCheckTimeout = null;
    }
  }

  /**
   * Handles clicks on cart upsell "Add to cart" buttons.
   * Uses event delegation so it keeps working after DOM morphs.
   * @param {MouseEvent} event
   */
  #handleUpsellClick = async (event) => {
    const target = /** @type {HTMLElement | null} */ (event.target instanceof HTMLElement ? event.target : null);
    if (!target) return;

    const button = target.closest('[data-cart-upsell-add]');
    if (!button || !(button instanceof HTMLButtonElement)) return;
    if (!this.contains(button)) return;

    const variantId = Number(button.dataset.variantId);
    if (!variantId) return;

    if (button.disabled) return;
    button.disabled = true;

    const originalText = button.textContent;
    button.textContent = 'Adding...';

    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [{ id: variantId, quantity: 1 }],
        }),
      });

      if (!response.ok) {
        // Non-fatal: restore UI and bail.
        button.textContent = originalText;
        button.disabled = false;
        return;
      }

      // Refresh the cart drawer sections so UI updates immediately.
      await this.#refreshCart('cart-upsell');
    } catch (error) {
      console.error('Error adding upsell product:', error);
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  };

  #loadCartGoals() {
    const goalsDataElement = document.getElementById('cart-goals-data');
    if (goalsDataElement) {
      try {
        const data = JSON.parse(goalsDataElement.textContent);
        this.#cartGoals = data.goals || [];
        this.#goalCountdownEnabled = Boolean(data?.countdown?.enabled);
        this.#goalCountdownDurationMs = Number(data?.countdown?.durationMs) || 0;
      } catch (error) {
        console.error('Failed to parse cart goals data:', error);
      }
    }
  }

  #initGoalCountdown() {
    // Always attempt to paint the countdown line (in case a stored timer exists)
    // and start the ticker; it will hide itself when disabled / empty cart.
    this.#startGoalCountdownTicker();
    this.#updateGoalCountdownUI();

    // Sync countdown start/clear against the actual cart state once we can.
    // Avoid blocking initial paint.
    if (!this.#goalCountdownEnabled || this.#goalCountdownDurationMs <= 0) return;

    const run = async () => {
      try {
        const cart = await this.#fetchCartData(true);
        const spVariantId = this._shippingProtectionVariantId;
        const items = Array.isArray(cart?.items) ? cart.items : [];
        const itemCount = items.reduce((sum, item) => {
          if (!item) return sum;
          if (spVariantId && item.variant_id === spVariantId) return sum;
          return sum + (item.quantity || 0);
        }, 0);

        this.#syncGoalCountdownWithItemCount(itemCount);
        this.#updateGoalCountdownUI();
      } catch (e) {
        // Non-fatal: countdown will sync on the next cart update event.
      }
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(run, { timeout: 1500 });
    } else {
      setTimeout(run, 150);
    }
  }

  #getGoalCountdownEndAt() {
    try {
      const raw = window.localStorage.getItem(this.#goalCountdownStorageKey);
      const ts = raw ? Number(raw) : 0;
      return Number.isFinite(ts) ? ts : 0;
    } catch {
      return 0;
    }
  }

  #setGoalCountdownEndAt(endAtMs) {
    try {
      window.localStorage.setItem(this.#goalCountdownStorageKey, String(endAtMs));
    } catch {
      // ignore
    }
  }

  #clearGoalCountdownEndAt() {
    try {
      window.localStorage.removeItem(this.#goalCountdownStorageKey);
    } catch {
      // ignore
    }
  }

  #syncGoalCountdownWithItemCount(itemCount) {
    if (!this.#goalCountdownEnabled || this.#goalCountdownDurationMs <= 0) {
      this.#clearGoalCountdownEndAt();
      return;
    }

    if (!itemCount || itemCount <= 0) {
      // Cart is empty (ignoring shipping protection) -> clear timer.
      this.#clearGoalCountdownEndAt();
      return;
    }

    const now = Date.now();
    const currentEndAt = this.#getGoalCountdownEndAt();

    // Only start a new timer if there isn't one yet or it expired.
    if (!currentEndAt || currentEndAt <= now) {
      this.#setGoalCountdownEndAt(now + this.#goalCountdownDurationMs);
    }
  }

  #startGoalCountdownTicker() {
    if (this.#goalCountdownInterval) return;
    this.#goalCountdownInterval = setInterval(() => {
      this.#updateGoalCountdownUI();
    }, 1000);
  }

  #stopGoalCountdownTicker() {
    if (!this.#goalCountdownInterval) return;
    clearInterval(this.#goalCountdownInterval);
    this.#goalCountdownInterval = null;
  }

  #formatCountdown(msRemaining) {
    const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    if (hours > 0) {
      const hh = String(hours).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    }
    return `${mm}:${ss}`;
  }

  #updateGoalCountdownUI() {
    const nodes = this.querySelectorAll('[data-cart-goal-countdown]');
    if (!nodes || nodes.length === 0) return;

    if (!this.#goalCountdownEnabled || this.#goalCountdownDurationMs <= 0) {
      nodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        n.textContent = '';
        n.setAttribute('hidden', '');
      });
      return;
    }

    const endAt = this.#getGoalCountdownEndAt();
    if (!endAt) {
      nodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        n.textContent = '';
        n.setAttribute('hidden', '');
      });
      return;
    }

    const now = Date.now();
    let remaining = endAt - now;
    
    // Reset timer when it finishes
    if (remaining <= 0) {
      // Timer expired - reset it
      const newEndAt = now + this.#goalCountdownDurationMs;
      this.#setGoalCountdownEndAt(newEndAt);
      remaining = this.#goalCountdownDurationMs;
    }

    const text = this.#formatCountdown(remaining);
    nodes.forEach((n) => {
      if (!(n instanceof HTMLElement)) return;
      n.textContent = `Ends in ${text}`;
      n.removeAttribute('hidden');
    });
  }

  /**
   * Sets the loading state of the cart drawer
   * @param {boolean} isLoading - Whether the drawer is loading
   */
  #setLoading(isLoading) {
    if (!this.#loadingElement) return;
    this.#loadingElement.classList.toggle('cart-drawer__loading--active', Boolean(isLoading));
  }

  /**
   * Handles cart update events
   * @param {CartUpdateEvent} event - The cart update event
   */
  #handleCartUpdateEvent = (event) => {
    const source = event?.detail?.data?.source;
    const itemCount = event?.detail?.data?.itemCount;
    // Keep countdown in sync on ALL cart updates, even those we "ignore".
    // Only sync against itemCount when it is provided (some cart:update sources may omit it).
    if (typeof itemCount === 'number') {
      this.#syncGoalCountdownWithItemCount(itemCount);
    }
    // After section HTML morphs into place, countdown nodes may be replaced.
    setTimeout(() => this.#updateGoalCountdownUI(), 0);

    // Ignore cart updates that were triggered by the cart goals or shipping protection
    if (source === 'cart-goals' || source === 'shipping-protection') {
      // Update cache with new cart data from event
      if (event.detail?.resource) {
        const resource = event.detail.resource;
        // @ts-ignore - Adding timestamp for cache validation
        resource._timestamp = Date.now();
        this.#cachedCartData = resource;
      }

      // Re-bind shipping protection toggle after DOM morphs
      setTimeout(() => this.#bindShippingProtection(), 0);
      return;
    }

    // Invalidate cache when cart is updated externally
    this.#cachedCartData = null;
    
    // Clear any pending debounced check
    if (this.#goalCheckTimeout) {
      clearTimeout(this.#goalCheckTimeout);
      this.#goalCheckTimeout = null;
    }

    // Use cart data from event if available (faster, no API call needed)
    const cartFromEvent = event.detail?.resource;
    if (cartFromEvent) {
      // Check goals immediately with fresh cart data from event
      this.#checkAndApplyGoalsWithCart(cartFromEvent);
    } else {
      // If no cart data in event, fetch it (but with minimal delay)
      // Use a very short delay (50ms) to batch rapid updates without noticeable delay
      this.#goalCheckTimeout = setTimeout(() => {
        this.#checkAndApplyGoals();
        this.#goalCheckTimeout = null;
      }, 50);
    }

    // Re-bind shipping protection after cart updates from other sources
    setTimeout(() => this.#bindShippingProtection(), 0);

    // If, after this cart update, there are no non-shipping-protection items
    // left (itemCount is calculated in a way that ignores shipping
    // protection), automatically remove the shipping protection line so the
    // cart truly behaves as empty.
    const spVariantId = this._shippingProtectionVariantId;
    
    console.log('Cart update event:', { itemCount, spVariantId, source }); // DEBUG
    
    if (itemCount === 0 && spVariantId) {
      console.log('Removing shipping protection due to empty cart'); // DEBUG
      (async () => {
        await this.#removeShippingProtection(spVariantId, true);
      })();
    }
  };

  /**
   * Fetches cart data with caching and request deduplication
   * @param {boolean} useCache - Whether to use cached data if available
   * @returns {Promise<any>} Cart data
   */
  async #fetchCartData(useCache = true) {
    // Return cached data if available and fresh (less than 1 second old)
    if (useCache && this.#cachedCartData) {
      const cachedData = /** @type {any} */ (this.#cachedCartData);
      const cacheAge = Date.now() - (cachedData._timestamp || 0);
      if (cacheAge < 1000) {
        return this.#cachedCartData;
      }
    }

    // Deduplicate concurrent requests
    if (this.#cartFetchPromise) {
      return this.#cartFetchPromise;
    }

    this.#cartFetchPromise = fetch('/cart.js')
      .then(response => response.json())
      .then(cart => {
        // Store timestamp for cache validation
        const cartWithTimestamp = /** @type {any} */ (cart);
        cartWithTimestamp._timestamp = Date.now();
        this.#cachedCartData = cart;
        return cart;
      })
      .finally(() => {
        // Clear promise after a short delay to allow batching
        setTimeout(() => {
          this.#cartFetchPromise = null;
        }, 100);
      });

    return this.#cartFetchPromise;
  }

  /**
   * Checks and applies goals with provided cart data (no API call)
   * @param {any} cart - The cart data to use
   */
  async #checkAndApplyGoalsWithCart(cart) {
    if (this.#isProcessingGoals || this.#cartGoals.length === 0) return;

    // Validate cart data before processing
    if (!cart || !Array.isArray(cart.items)) {
      console.warn('Invalid cart data in event, fetching fresh cart:', cart);
      // Fall back to fetching cart if event data is invalid
      this.#checkAndApplyGoals();
      return;
    }

    this.#isProcessingGoals = true;
    this.#setLoading(true);

    try {
      // Update cache with fresh cart data
      const cartWithTimestamp = /** @type {any} */ (cart);
      cartWithTimestamp._timestamp = Date.now();
      this.#cachedCartData = cart;

      // Process goals with this cart data
      await this.#processGoals(cart);
    } catch (error) {
      console.error('Error checking cart goals:', error);
    } finally {
      this.#isProcessingGoals = false;
      this.#setLoading(false);
    }
  }

  /**
   * Checks and applies goals (fetches cart data if needed)
   */
  async #checkAndApplyGoals() {
    if (this.#isProcessingGoals || this.#cartGoals.length === 0) return;

    this.#isProcessingGoals = true;
    this.#setLoading(true);

    try {
      // Fetch current cart (don't use cache to ensure fresh data)
      const cart = await this.#fetchCartData(false);
      
      // Validate cart data
      if (!cart || !Array.isArray(cart.items)) {
        console.warn('Invalid cart data fetched:', cart);
        return;
      }
      
      // Process goals with fresh cart data
      await this.#processGoals(cart);
    } catch (error) {
      console.error('Error checking cart goals:', error);
    } finally {
      this.#isProcessingGoals = false;
      this.#setLoading(false);
    }
  }

  /**
   * Processes cart goals and applies necessary changes
   * @param {any} cart - The cart data to process
   */
  async #processGoals(cart) {
    // Wait for any ongoing cart operations to complete
    if (this.#cartOperationLock) {
      await this.#cartOperationLock;
    }

    // Validate cart data
    if (!cart || !Array.isArray(cart.items)) {
      console.warn('Invalid cart data received:', cart);
      return;
    }

    // Helper: determine if a line item is a free gift for any configured goal.
    // We only treat items that both match a goal product_id AND carry the
    // `_is_free_gift: 'true'` property as "goal gift" items. This allows the
    // same product to be sold normally (or as part of a bundle) without
    // conflicting with the free gift logic.
    const isGoalGiftItem = (/** @type {any} */ item) => {
      if (!item || typeof item.product_id === 'undefined') return false;

      // Check for the _is_free_gift flag in line item properties
      const props = item.properties;
      let isFreeGift = false;

      if (props) {
        if (typeof props === 'object' && !Array.isArray(props)) {
          isFreeGift = props._is_free_gift === 'true';
        } else if (Array.isArray(props)) {
          isFreeGift = props.some(
            (prop) => prop && prop[0] === '_is_free_gift' && prop[1] === 'true'
          );
        }
      }

      if (!isFreeGift) return false;

      // Only consider it a goal gift if its product_id is tied to a goal
      return this.#cartGoals.some((goal) => goal && goal.productId === item.product_id);
    };

    // Calculate cart total excluding ONLY goal gift products (not all lines
    // that share the same product). This prevents bundles or manually added
    // versions of the same product from interfering with thresholds.
    const cartItems = Array.isArray(cart.items) ? cart.items : [];
    let cartTotalCents = 0;
    
    for (const item of cartItems) {
      if (!isGoalGiftItem(item)) {
        cartTotalCents += item.line_price || 0;
      }
    }

    // Collect all goal changes to batch them
    const changesToApply = [];

    // Check each goal
    for (const goal of this.#cartGoals) {
      if (!goal.enabled || !goal.variantId) continue;

      // If this goal is configured with an excludePropertyValue, and any
      // cart line item has a matching `bundle_id` line item property,
      // the goal should NOT apply (no auto-add), and any existing gift
      // should be treated as not required.
      let isBlockedByBundle = false;
      const excludeValue = goal.excludePropertyValue;
      if (excludeValue) {
        isBlockedByBundle = cartItems.some((/** @type {any} */ item) => {
          if (!item || !item.properties) return false;
          const props = item.properties;
          // `properties` is an object map in the AJAX cart response
          if (typeof props === 'object' && !Array.isArray(props)) {
            return props.bundle_id === excludeValue;
          }
          // Fallback in case properties is an array of key/value pairs
          if (Array.isArray(props)) {
            return props.some(
              (prop) => prop && prop[0] === 'bundle_id' && prop[1] === excludeValue
            );
          }
          return false;
        });
      }

      const shouldHaveProduct = !isBlockedByBundle && cartTotalCents >= goal.threshold;
      // Consider only dedicated free gift lines (with _is_free_gift) as the
      // goal product. Normal/bundle lines with the same product should not
      // satisfy nor be removed by this goal logic.
      const hasProduct = cartItems.some((/** @type {any} */ item) => {
        if (!item || item.product_id !== goal.productId) return false;
        return isGoalGiftItem(item);
      });

      if (shouldHaveProduct && !hasProduct) {
        changesToApply.push({ type: 'add', goal });
      } else if (!shouldHaveProduct && hasProduct) {
        // Only target the dedicated free gift line for removal.
        const item = cart.items.find((/** @type {any} */ item) =>
          item && item.product_id === goal.productId && isGoalGiftItem(item)
        );
        if (item && item.key) {
          // Add a small delay before removing to prevent race conditions
          // This prevents gifts from being removed if user adds items quickly
          changesToApply.push({ type: 'remove', goal, itemKey: item.key, delay: 100 });
        }
      }
    }

    // Apply all changes, then refresh once
    if (changesToApply.length > 0) {
      // Create a lock to prevent concurrent operations
      const lockResolvers = [];
      this.#cartOperationLock = new Promise(resolve => lockResolvers.push(resolve));

      try {
        // Invalidate cache before making changes
        this.#cachedCartData = null;
        
        // Apply changes sequentially to maintain order
        for (const change of changesToApply) {
          if (change.type === 'add') {
            // Add immediately - no delay
            await this.#addGoalProduct(change.goal.variantId, false);
          } else {
            // Small delay before removing to prevent race conditions
            if (change.delay) {
              await new Promise(resolve => setTimeout(resolve, change.delay));
              // Re-fetch cart to ensure we still need to remove it
              const freshCart = await this.#fetchCartData(false);
              
              // Validate fresh cart data
              if (!freshCart || !Array.isArray(freshCart.items)) {
                console.warn('Invalid cart data when checking removal:', freshCart);
                continue;
              }
              
              // Calculate fresh cart total with proper type handling
              const freshCartItems = Array.isArray(freshCart.items) ? freshCart.items : [];
              const freshCartTotalCents = freshCartItems
                .filter((item) => !isGoalGiftItem(item))
                .reduce((sum, item) => sum + (item.line_price || 0), 0);

              // Re-evaluate whether this goal should still apply, taking into
              // account bundle exclusions and the current cart total.
              let isBlockedByBundleFresh = false;
              const excludeValueFresh = change.goal.excludePropertyValue;
              if (excludeValueFresh) {
                isBlockedByBundleFresh = freshCartItems.some((/** @type {any} */ item) => {
                  if (!item || !item.properties) return false;
                  const props = item.properties;
                  if (typeof props === 'object' && !Array.isArray(props)) {
                    return props.bundle_id === excludeValueFresh;
                  }
                  if (Array.isArray(props)) {
                    return props.some(
                      (prop) => prop && prop[0] === 'bundle_id' && prop[1] === excludeValueFresh
                    );
                  }
                  return false;
                });
              }

              const shouldStillHaveProduct =
                !isBlockedByBundleFresh && freshCartTotalCents >= change.goal.threshold;

              // Remove if goal should no longer apply (either threshold not met
              // or blocked by an excluded bundle line item).
              if (!shouldStillHaveProduct) {
                await this.#removeGoalProduct(change.itemKey, false);
              }
            } else {
              await this.#removeGoalProduct(change.itemKey, false);
            }
          }
        }
        
        // Single refresh after all changes
        await this.#refreshCart();
      } finally {
        // Release the lock
        lockResolvers.forEach(resolve => resolve());
        this.#cartOperationLock = null;
      }
    }
  }

  /**
   * Adds a goal product to the cart
   * @param {string|number} variantId - The variant ID to add
   * @param {boolean} refreshImmediately - Whether to refresh the cart immediately
   */
  async #addGoalProduct(variantId, refreshImmediately = true) {
    try {
      const formData = {
        items: [{
          id: variantId,
          quantity: 1,
          properties: {
            '_is_free_gift': 'true'
          }
        }]
      };

      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        // Invalidate cache
        this.#cachedCartData = null;
        
        if (refreshImmediately) {
          await this.#refreshCart();
        }
      }
    } catch (error) {
      console.error('Error adding goal product:', error);
    }
  }

  /**
   * Removes a goal product from the cart
   * @param {string} itemKey - The cart item key to remove
   * @param {boolean} refreshImmediately - Whether to refresh the cart immediately
   */
  async #removeGoalProduct(itemKey, refreshImmediately = true) {
    try {
      const response = await fetch('/cart/change.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: itemKey,
          quantity: 0
        })
      });

      if (response.ok) {
        // Invalidate cache
        this.#cachedCartData = null;
        
        if (refreshImmediately) {
          await this.#refreshCart();
        }
      }
    } catch (error) {
      console.error('Error removing goal product:', error);
    }
  }

  async #refreshCart(source = 'cart-goals') {
    try {
      this.#setLoading(true);
      
      // Get the latest cart state (don't use cache here since we're refreshing)
      const cart = await this.#fetchCartData(false);

      // Calculate a user-facing item count that ignores shipping protection so
      // the cart bubble and other UI treat it as a fee, not a product.
      let itemCount = cart?.item_count ?? 0;
      const spVariantId = this._shippingProtectionVariantId;
      if (spVariantId && Array.isArray(cart?.items)) {
        itemCount = cart.items.reduce((sum, /** @type {any} */ item) => {
          if (!item) return sum;
          if (item.variant_id === spVariantId) return sum;
          return sum + (item.quantity || 0);
        }, 0);
      }

      // Determine which sections need to be updated based on the
      // currently mounted cart items components.
      /** @type {Set<string>} */
      const sectionsToUpdate = new Set();
      document.querySelectorAll('cart-items-component').forEach((element) => {
        if (element instanceof HTMLElement && element.dataset.sectionId) {
          sectionsToUpdate.add(element.dataset.sectionId);
        }
      });

      // Only fetch sections if there are any to update
      if (sectionsToUpdate.size > 0) {
        /** @type {Record<string, string>} */
        const sections = {};

        // Fetch fresh HTML for all affected sections in parallel
        // Use cache: false to ensure we get the latest state
        await Promise.all(
          Array.from(sectionsToUpdate).map(async (sectionId) => {
            sections[sectionId] = await sectionRenderer.getSectionHTML(sectionId, false);
          })
        );

        document.dispatchEvent(
          new CartUpdateEvent(cart, source, {
            source: source,
            itemCount,
            sections,
          })
        );
      } else {
        // If no sections to update, still dispatch event with cart data
        document.dispatchEvent(
          new CartUpdateEvent(cart, source, {
            source: source,
            itemCount,
          })
        );
      }
    } catch (error) {
      console.error('Error refreshing cart:', error);
    } finally {
      this.#setLoading(false);
      // After a refresh, ensure shipping protection is bound once the DOM settles
      setTimeout(() => this.#bindShippingProtection(), 0);
    }
  }

  /**
   * Updates the shipping protection checkbox state without triggering the change event
   * @param {boolean} checked
   */
  #updateShippingProtectionCheckbox(checked) {
    const container = this.querySelector('.cart__shipping-protection[data-shipping-protection]');
    if (!container) return;

    const checkbox = container.querySelector('.cart__shipping-protection-checkbox');
    if (checkbox && checkbox instanceof HTMLInputElement) {
      // Update checkbox without triggering change event
      checkbox.checked = checked;
    }
  }

  /**
   * Binds the shipping protection toggle inside the cart drawer summary.
   * This is treated as a simple upsell separate from cart goals.
   */
  #bindShippingProtection() {
    /** @type {HTMLElement | null} */
    const container = this.querySelector('.cart__shipping-protection[data-shipping-protection]');
    if (!container) {
      console.log('bindShippingProtection: container not found');
      return;
    }

    /** @type {HTMLInputElement | null} */
    const checkbox = container.querySelector('.cart__shipping-protection-checkbox');
    if (!checkbox) {
      console.log('bindShippingProtection: checkbox not found');
      return;
    }

    const variantIdRaw = container.dataset.spVariantId;
    const defaultOn = container.dataset.spDefaultOn === 'true';
    const inCart = container.dataset.spInCart === 'true';

    console.log('bindShippingProtection: raw data from dataset', { 
      variantIdRaw, 
      defaultOn, 
      inCart,
      allDataset: container.dataset 
    });

    if (!variantIdRaw) {
      console.log('bindShippingProtection: variantIdRaw is empty, cannot proceed');
      return;
    }
    
    const variantId = Number(variantIdRaw);
    if (!variantId) {
      console.log('bindShippingProtection: variantId conversion failed', { variantIdRaw, variantId });
      return;
    }

    console.log('bindShippingProtection: successfully parsed', { variantId, defaultOn, inCart });

    // Store config for later cart-based syncing
    this._shippingProtectionVariantId = variantId;
    this._shippingProtectionDefaultOn = defaultOn;
    if (typeof this._shippingProtectionUserDisabled !== 'boolean') {
      this._shippingProtectionUserDisabled = false;
    }

    // Initial visual state matches whether the item is currently in the cart.
    checkbox.checked = inCart;

    // ВАЖНО: Проверяем не по data-атрибуту, а по наличию listener'а
    // Удаляем старый listener если есть, затем добавляем новый
    if (this._boundShippingProtectionHandler) {
      checkbox.removeEventListener('change', this._boundShippingProtectionHandler);
    }

    // Создаём bound функцию и сохраняем ссылку
    this._boundShippingProtectionHandler = () => {
      const checked = checkbox.checked;
      // Remember user choice while there are other items in the cart
      this._shippingProtectionUserDisabled = !checked;

      if (checked) {
        this.#addShippingProtection(variantId);
      } else {
        this.#removeShippingProtection(variantId);
      }
    };

    checkbox.addEventListener('change', this._boundShippingProtectionHandler);
    console.log('bindShippingProtection: event listener bound successfully');
  }

  /**
   * Adds the shipping protection product to the cart via AJAX.
   * @param {number} variantId
   * @param {boolean} shouldRefresh - Whether to refresh cart after adding
   */
  async #addShippingProtection(variantId, shouldRefresh = true) {
    // Prevent concurrent add calls — if one is already in-flight, skip.
    if (this._spAddInProgress) return;
    this._spAddInProgress = true;

    try {
      this.#setLoading(true);

      // Wait for any ongoing cart operation to finish
      if (this.#cartOperationLock) {
        await this.#cartOperationLock;
      }

      // Create lock
      /** @type {Array<() => void>} */
      const lockResolvers = [];
      this.#cartOperationLock = new Promise(resolve => lockResolvers.push(resolve));

      // Always fetch fresh cart data (no cache) to avoid stale reads
      const cartResponse = await fetch('/cart.js');
      const cart = await cartResponse.json();
      const items = Array.isArray(cart?.items) ? cart.items : [];

      /** @type {any[]} */
      const matchingItems = items.filter(
        (item) => item && item.variant_id === variantId
      );

      if (matchingItems.length === 0) {
        // Not in cart yet: add once
        const addResponse = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] }),
        });

        if (!addResponse.ok) {
          lockResolvers.forEach(resolve => resolve());
          this.#cartOperationLock = null;
          return;
        }
      } else {
        // Already present: ensure there is exactly ONE line with quantity 1
        const [primary, ...duplicates] = matchingItems;

        if (primary && primary.key && primary.quantity !== 1) {
          await fetch('/cart/change.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: primary.key, quantity: 1 }),
          });
        }

        // Remove any duplicate lines with the same variant
        for (const dup of duplicates) {
          if (!dup || !dup.key) continue;
          await fetch('/cart/change.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: dup.key, quantity: 0 }),
          });
        }
      }

      // Invalidate cache
      this.#cachedCartData = null;

      // Only refresh if requested (to prevent infinite loops)
      if (shouldRefresh) {
        await this.#refreshCart('shipping-protection');
      }

      // Update checkbox to reflect successful add
      this.#updateShippingProtectionCheckbox(true);

      // Release lock
      lockResolvers.forEach(resolve => resolve());
      this.#cartOperationLock = null;
    } catch (error) {
      console.error('Error adding shipping protection:', error);
      // Release lock on error
      if (this.#cartOperationLock) {
        this.#cartOperationLock = Promise.resolve();
      }
    } finally {
      this._spAddInProgress = false;
      this.#setLoading(false);
    }
  }

  /**
   * Removes the shipping protection product from the cart via AJAX.
   * @param {number} variantId
   * @param {boolean} shouldRefresh - Whether to refresh cart after removing
   */
  async #removeShippingProtection(variantId, shouldRefresh = true) {
    try {
      this.#setLoading(true);

      // Wait for any ongoing operations
      if (this.#cartOperationLock) {
        await this.#cartOperationLock;
      }

      // Create lock
      /** @type {Array<() => void>} */
      const lockResolvers = [];
      this.#cartOperationLock = new Promise(resolve => lockResolvers.push(resolve));

      const cart = await this.#fetchCartData(false);
      const items = Array.isArray(cart?.items) ? cart.items : [];

      /** @type {any[]} */
      const matchingItems = items.filter(
        (item) => item && item.variant_id === variantId
      );

      for (const match of matchingItems) {
        if (!match || !match.key) continue;
        await fetch('/cart/change.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: match.key,
            quantity: 0,
          }),
        });
      }

      this.#cachedCartData = null;
      
      // Only refresh if requested (to prevent infinite loops)
      if (shouldRefresh) {
        await this.#refreshCart('shipping-protection');
      }
      
      // Update checkbox to reflect successful removal
      this.#updateShippingProtectionCheckbox(false);
      
      // Release lock
      lockResolvers.forEach(resolve => resolve());
      this.#cartOperationLock = null;
    } catch (error) {
      console.error('Error removing shipping protection:', error);
      // Release lock on error
      if (this.#cartOperationLock) {
        this.#cartOperationLock = Promise.resolve();
      }
    } finally {
      this.#setLoading(false);
    }
  }

  /**
   * Handles cart add events
   * @param {CartAddEvent} event - The cart add event
   */
  #handleCartAdd = (event) => {
    const source = event?.detail?.data?.source;
    // Ignore synthetic cart:add events coming from cart goals or shipping
    // protection refreshes to avoid recursive opens.
    if (source === 'cart-goals' || source === 'shipping-protection') {
      return;
    }

    if (this.hasAttribute('auto-open')) {
      this.open();
    }

    // Start countdown as soon as the cart becomes non-empty, but do not reset
    // an existing timer (it is persisted in localStorage).
    this.#syncGoalCountdownWithItemCount(1);
    this.#updateGoalCountdownUI();
    
    // Clear any pending debounced checks
    if (this.#goalCheckTimeout) {
      clearTimeout(this.#goalCheckTimeout);
      this.#goalCheckTimeout = null;
    }
    
    // Use cart data from event if available for immediate processing
    const cartFromEvent = event?.detail?.resource;
    if (cartFromEvent) {
      // Check goals immediately with fresh cart data from event (no delay!)
      this.#checkAndApplyGoalsWithCart(cartFromEvent);
    } else {
      // If no cart data, fetch immediately (no debounce for cart additions)
      this.#checkAndApplyGoals();
    }

    // Auto-add shipping protection on add-to-cart when globally enabled by
    // default and the customer has not explicitly turned it off. This keeps
    // the logic tied to add events instead of every cart:update.
    // Set a timestamp so open() knows an add-to-cart just happened and can
    // skip its own redundant auto-add check.
    const spVariantId = this._shippingProtectionVariantId;
    const defaultOn = Boolean(this._shippingProtectionDefaultOn);
    const userDisabled = Boolean(this._shippingProtectionUserDisabled);
    if (spVariantId && defaultOn && !userDisabled) {
      this._spLastAutoAddAt = Date.now();
      this.#addShippingProtection(spVariantId);
    }
  };

  async open() {
    // Show the drawer immediately for a fast first paint.
    this.showDialog();
    // Ensure countdown renders immediately when the drawer opens.
    this.#updateGoalCountdownUI();

    // ВАЖНО: Ждём пока DOM корзины РЕАЛЬНО загрузится с сервера
    // Используем MutationObserver для отслеживания изменений DOM
    const waitForShippingProtectionElement = () => {
      return new Promise((resolve) => {
        // Сначала проверяем, может элемент уже есть
        const existing = this.querySelector('.cart__shipping-protection[data-shipping-protection]');
        if (existing) {
          console.log('Shipping protection element already exists');
          resolve(true);
          return;
        }

        console.log('Waiting for shipping protection element to appear...');
        
        // Если нет - ждём его появления через MutationObserver
        const observer = new MutationObserver((mutations, obs) => {
          const element = this.querySelector('.cart__shipping-protection[data-shipping-protection]');
          if (element) {
            console.log('Shipping protection element appeared!');
            obs.disconnect();
            resolve(true);
          }
        });

        observer.observe(this, {
          childList: true,
          subtree: true
        });

        // Таймаут на случай если элемент не появится (корзина пустая или ошибка)
        setTimeout(() => {
          observer.disconnect();
          console.log('Timeout waiting for shipping protection element');
          resolve(false);
        }, 2000);
      });
    };

    // Ждём появления элемента
    const found = await waitForShippingProtectionElement();
    
    if (!found) {
      console.log('Shipping protection element never appeared, skipping sync');
      return;
    }
    
    // Ensure the shipping protection toggle is bound when the summary
    // markup is present.
    this.#bindShippingProtection();
    
    // После биндинга проверяем состояние корзины и shipping protection
    const spVariantId = this._shippingProtectionVariantId;
    const defaultOn = Boolean(this._shippingProtectionDefaultOn);
    const userDisabled = Boolean(this._shippingProtectionUserDisabled);
    
    console.log('Shipping protection config:', { spVariantId, defaultOn, userDisabled });
    
    if (!spVariantId) {
      console.log('No shipping protection variant ID found, skipping sync');
      return;
    }
    
    // Получаем текущее состояние корзины
    const cart = await this.#fetchCartData(false);
    const items = Array.isArray(cart?.items) ? cart.items : [];
    
    // Проверяем есть ли другие товары (не shipping protection)
    const hasOtherItems = items.some(item => item && item.variant_id !== spVariantId);
    
    // Проверяем есть ли уже shipping protection в корзине
    const hasShippingProtection = items.some(item => item && item.variant_id === spVariantId);
    
    console.log('Open cart - state:', { hasOtherItems, hasShippingProtection, itemsCount: items.length });
    
    if (hasShippingProtection && !hasOtherItems) {
      // Если в корзине только shipping protection - удаляем его
      console.log('Removing shipping protection - cart is empty');
      await this.#removeShippingProtection(spVariantId, true);
      // Сбрасываем флаг что пользователь отключил
      this._shippingProtectionUserDisabled = false;
    } else if (defaultOn && !userDisabled && hasOtherItems && !hasShippingProtection) {
      // Skip if the add-to-cart handler already triggered an auto-add
      // within the last 3 seconds — it will handle it, and our cart fetch
      // here may be reading stale state before that add has landed.
      const recentAutoAdd = this._spLastAutoAddAt && (Date.now() - this._spLastAutoAddAt) < 3000;
      if (!recentAutoAdd) {
        console.log('Auto-adding shipping protection from open()');
        await this.#addShippingProtection(spVariantId, true);
      } else {
        console.log('Skipping open() auto-add — add-to-cart handler already triggered it');
      }
    }

    /**
     * Close cart drawer when installments CTA is clicked to avoid overlapping dialogs
     */
    customElements.whenDefined('shopify-payment-terms').then(() => {
      const installmentsContent = document.querySelector('shopify-payment-terms')?.shadowRoot;
      const cta = installmentsContent?.querySelector('#shopify-installments-cta');
      cta?.addEventListener('click', this.closeDialog, { once: true });
    });
  }

  close() {
    this.closeDialog();
  }
}

if (!customElements.get('cart-drawer-component')) {
  customElements.define('cart-drawer-component', CartDrawerComponent);
}