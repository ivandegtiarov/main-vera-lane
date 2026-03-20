#!/usr/bin/env node

/**
 * Vera Lane Landing Page Generator
 *
 * Creates a Shopify template JSON file for an advertorial landing page.
 *
 * Usage:
 *   node scripts/create-landing-page.js <content-file.json>
 *
 * The content file should follow this structure:
 * {
 *   "slug": "why-women-over-50-love-this",
 *   "hero": {
 *     "headline": "...",
 *     "category": "BEAUTY",
 *     "bg_image": "shopify://shop_images/hero-image.jpg",
 *     "review_count": "12,400+ Reviews"
 *   },
 *   "reasons": [
 *     { "title": "...", "body": "<p>...</p>", "image": "shopify://shop_images/reason-1.jpg" },
 *     ...
 *   ],
 *   "product": {
 *     "name": "Mature Skin Foundation",
 *     "description": "<p>...</p>",
 *     "image": "shopify://shop_images/product.png",
 *     "badge": "VIP SALE — Up to 50% Off",
 *     "cta_text": "Check Availability",
 *     "cta_url": "shopify://products/color-changing-foundation",
 *     "features": ["Hydrating", "Anti-Aging", "SPF 15", "Lightweight", "Tone-Adapting"]
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function generateId(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

function buildTemplate(content) {
  const heroId = `bl_hero_${generateId()}`;
  const productId = `bl_product_card_split_${generateId()}`;
  const reasonIds = content.reasons.map(() => `bl_reason_item_${generateId()}`);
  const featureIds = content.product.features.map(() => `feature_${generateId()}`);

  const sections = {};

  // Hero
  sections[heroId] = {
    type: 'bl-hero',
    name: 'BL - Hero',
    settings: {
      section_id: '',
      bg_image_asset: content.hero.bg_image_asset || '',
      bg_color: '#2d2d2d',
      overlay_opacity: 80,
      category: content.hero.category || 'BEAUTY',
      headline: content.hero.headline,
      subheadline: content.hero.subheadline || '',
      show_rating: true,
      review_count: content.hero.review_count || '12,400+ Reviews',
      cta_text: 'Read More',
      cta_type: 'anchor',
      cta_anchor: 'offer',
      cta_url: '',
      cta_text_color: '#ffffff',
      cta_border_color: '#ffffff',
    },
  };

  // Reasons
  content.reasons.forEach((reason, i) => {
    sections[reasonIds[i]] = {
      type: 'bl-reason-item',
      name: 'BL - Reason Item',
      settings: {
        section_id: '',
        bg_color: '#faf9f7',
        number: String(i + 1),
        title: reason.title,
        body_text: reason.body,
        link_text: '',
        link_type: 'anchor',
        link_anchor: '',
        link_url: '',
        image_asset: reason.image_asset || '',
        image_position: 'right',
      },
    };
  });

  // Product card
  const featureBlocks = {};
  featureIds.forEach((id, i) => {
    featureBlocks[id] = {
      type: 'feature',
      settings: {
        label: content.product.features[i],
      },
    };
  });

  sections[productId] = {
    type: 'bl-product-card-split',
    blocks: featureBlocks,
    block_order: featureIds,
    name: 'BL - Product Card Split',
    settings: {
      section_id: 'offer',
      bg_color: '#faf9f7',
      sale_badge: content.product.badge || 'VIP SALE — Up to 50% Off',
      badge_bg: '#d4a574',
      badge_text: '#2d2d2d',
      product_name: content.product.name || 'Mature Skin Foundation',
      description: content.product.description || '<p>A lightweight, buildable formula designed specifically for mature skin.</p>',
      image: content.product.image || '',
      more_colors_text: '+12 More Shades',
      cta_text: content.product.cta_text || 'Check Availability',
      cta_url: content.product.cta_url || 'shopify://products/color-changing-foundation',
      cta_bg: '#000000',
      cta_text_color: '#ffffff',
    },
  };

  const order = [heroId, ...reasonIds, productId];

  return {
    layout: 'theme.vl-landing',
    sections,
    order,
  };
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node scripts/create-landing-page.js <content-file.json>');
    console.error('\nSee script header for content file format.');
    process.exit(1);
  }

  const contentPath = path.resolve(args[0]);
  if (!fs.existsSync(contentPath)) {
    console.error(`File not found: ${contentPath}`);
    process.exit(1);
  }

  const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
  const slug = content.slug;

  if (!slug) {
    console.error('Content file must include a "slug" field');
    process.exit(1);
  }

  const template = buildTemplate(content);
  const outputPath = path.join(__dirname, '..', 'templates', `page.${slug}.json`);

  fs.writeFileSync(outputPath, JSON.stringify(template, null, 2));
  console.log(`Template created: templates/page.${slug}.json`);
  console.log(`\nNext steps:`);
  console.log(`  1. Upload images to Shopify: Settings → Files → Upload`);
  console.log(`  2. Create page in Shopify: Online Store → Pages → Add page`);
  console.log(`     - Title: ${content.hero.headline}`);
  console.log(`     - Template: page.${slug}`);
  console.log(`  3. Push to git: git add templates/page.${slug}.json && git commit && git push`);
}

module.exports = { buildTemplate, generateId };
