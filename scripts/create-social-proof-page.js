#!/usr/bin/env node

/**
 * Vera Lane Social Proof Landing Page Generator
 *
 * Creates a Shopify template JSON using existing sections
 * for a customer reviews/testimonials landing page.
 *
 * Usage:
 *   node scripts/create-social-proof-page.js <content-file.json>
 *
 * Content file format:
 * {
 *   "slug": "lp-what-women-over-40-say-foundation",
 *   "hero": { "headline", "subheadline", "category", "bg_image_asset", "show_rating", "review_count", "cta_text", "cta_anchor" },
 *   "intro": { "content" },
 *   "featured_testimonials": [{ "quote", "name" }],
 *   "review_sections": [{ "headline", "rating_summary_text", "initial_count", "reviews": [{ "rating", "date", "title", "quote", "name", "verified" }] }],
 *   "featured_quote": { "eyebrow", "quote", "author", "verified" },
 *   "trust_badges": [{ "title", "description" }],
 *   "cta": { "text", "button_text", "button_url", "subtext" },
 *   "sticky_cta": { "button_text", "url" }
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
  const sections = {};
  const order = [];

  // 1. Hero (bl-hero)
  const heroId = `bl_hero_${generateId()}`;
  sections[heroId] = {
    type: 'bl-hero',
    name: 'BL - Hero',
    settings: {
      section_id: '',
      bg_image_asset: content.hero.bg_image_asset || '',
      bg_color: '#2d2d2d',
      overlay_opacity: content.hero.overlay_opacity || 35,
      category: content.hero.category || 'REAL REVIEWS',
      headline: content.hero.headline,
      subheadline: content.hero.subheadline || '',
      show_rating: content.hero.show_rating !== false,
      review_count: content.hero.review_count || '5,000+ Reviews',
      cta_text: content.hero.cta_text || 'SEE THE REVIEWS',
      cta_type: 'anchor',
      cta_anchor: content.hero.cta_anchor || 'reviews',
    },
  };
  order.push(heroId);

  // 2. Intro (vl-rich-text)
  if (content.intro) {
    const introId = `vl_rich_text_${generateId()}`;
    sections[introId] = {
      type: 'vl-rich-text',
      name: 'VL Rich Text',
      settings: {
        section_id: 'reviews',
        subheading: content.intro.subheading || '',
        content: content.intro.content,
        bg_color: '#ffffff',
        heading_color: '#000000',
        text_color: '#333333',
        link_color: '#5C1A33',
      },
    };
    order.push(introId);
  }

  // 3. Featured testimonials carousel (vl-testimonial-centered)
  if (content.featured_testimonials && content.featured_testimonials.length > 0) {
    const carouselId = `vl_testimonial_centered_${generateId()}`;
    const blocks = {};
    const blockOrder = [];

    content.featured_testimonials.forEach((t) => {
      const id = `testimonial_${generateId()}`;
      blocks[id] = {
        type: 'testimonial',
        settings: {
          quote: t.quote,
          name: t.name || '',
        },
      };
      blockOrder.push(id);
    });

    sections[carouselId] = {
      type: 'vl-testimonial-centered',
      blocks,
      block_order: blockOrder,
      name: 'VL Testimonial Centered',
      settings: {
        heading: content.featured_testimonials_heading || 'WHAT OUR CUSTOMERS SAID',
        bg_color: '#F5EDE8',
        heading_color: '#000000',
        card_bg_color: '#ffffff',
        quote_color: '#333333',
        star_color: '#F7A81B',
      },
    };
    order.push(carouselId);
  }

  // 4. Review sections (vl-review-cards — can have multiple)
  (content.review_sections || []).forEach((section, i) => {
    const sectionId = `vl_review_cards_${generateId()}`;
    const blocks = {};
    const blockOrder = [];

    (section.reviews || []).forEach((r) => {
      const id = `review_${generateId()}`;
      blocks[id] = {
        type: 'review',
        settings: {
          rating: r.rating || 5,
          date: r.date || '',
          title: r.title || '',
          quote: r.quote,
          name: r.name || '',
          verified: r.verified !== false,
        },
      };
      blockOrder.push(id);
    });

    sections[sectionId] = {
      type: 'vl-review-cards',
      blocks,
      block_order: blockOrder,
      name: 'VL - Review Cards',
      settings: {
        section_id: i === 0 ? 'review-cards' : '',
        headline: section.headline || 'Customer Reviews',
        show_rating_summary: true,
        rating_summary_text: section.rating_summary_text || 'Based on 1,247 reviews',
        initial_count: section.initial_count || 8,
        load_more_text: 'Load More Reviews',
        see_all_text: '',
        see_all_url: '',
        bg_color: '#ffffff',
        card_bg_color: '#ffffff',
        star_color: '#fbbf24',
        text_color: '#4b5563',
        name_color: '#374151',
      },
    };
    order.push(sectionId);

    // Insert featured quote after first review section
    if (i === 0 && content.featured_quote) {
      const quoteId = `bl_customer_quote_${generateId()}`;
      sections[quoteId] = {
        type: 'bl-customer-quote',
        name: 'BL - Customer Quote',
        settings: {
          section_id: '',
          bg_color: '#FAF9F7',
          eyebrow: content.featured_quote.eyebrow || 'WHAT CUSTOMERS ARE SAYING',
          quote: content.featured_quote.quote,
          author: content.featured_quote.author || '',
          verified: content.featured_quote.verified !== false,
        },
      };
      order.push(quoteId);
    }
  });

  // 5. Trust bar (bl-trust-bar)
  if (content.trust_badges && content.trust_badges.length > 0) {
    const trustId = `bl_trust_bar_${generateId()}`;
    const blocks = {};
    const blockOrder = [];

    content.trust_badges.forEach((badge) => {
      const id = `badge_${generateId()}`;
      blocks[id] = {
        type: 'badge',
        settings: {
          title: badge.title,
          description: badge.description || '',
        },
      };
      blockOrder.push(id);
    });

    sections[trustId] = {
      type: 'bl-trust-bar',
      blocks,
      block_order: blockOrder,
      name: 'BL - Trust Bar',
      settings: {
        section_id: '',
        bg_color: '#2D2D2D',
        headline: 'Your Satisfaction, Guaranteed',
        cta_label: 'Shop Now',
        cta_link_type: 'url',
        cta_url: '/products/color-changing-foundation',
      },
    };
    order.push(trustId);
  }

  // 6. CTA block (vl-cta-block)
  if (content.cta) {
    const ctaId = `vl_cta_block_${generateId()}`;
    sections[ctaId] = {
      type: 'vl-cta-block',
      name: 'VL CTA Block',
      settings: {
        text: content.cta.text || '',
        button_url: content.cta.button_url || '/products/color-changing-foundation',
        button_text: content.cta.button_text || 'TRY IT TODAY',
        subtext: content.cta.subtext || '',
        bg_color: '#ffffff',
        text_color: '#333333',
        button_bg_color: '#5C1A33',
        button_text_color: '#ffffff',
      },
    };
    order.push(ctaId);
  }

  // 7. Sticky CTA (vl-sticky-cta)
  if (content.sticky_cta) {
    const stickyId = `vl_sticky_cta_${generateId()}`;
    sections[stickyId] = {
      type: 'vl-sticky-cta',
      name: 'VL Sticky CTA',
      settings: {
        url: content.sticky_cta.url || '/products/color-changing-foundation',
        button_text: content.sticky_cta.button_text || 'TRY IT TODAY',
        show_amazon_icon: false,
        bg_color: '#ffffff',
        button_bg_color: '#5C1A33',
        button_text_color: '#ffffff',
        icon_bg_color: '#ffffff',
      },
    };
    order.push(stickyId);
  }

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
    console.error('Usage: node scripts/create-social-proof-page.js <content-file.json>');
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
  console.log(`  1. Commit and push branch to GitHub`);
  console.log(`  2. Create PR and merge into main`);
  console.log(`  3. Create page via Shopify Admin API with template_suffix: ${slug}`);
}

module.exports = { buildTemplate, generateId };
