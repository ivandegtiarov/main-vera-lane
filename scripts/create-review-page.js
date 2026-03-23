#!/usr/bin/env node

/**
 * Vera Lane Single Product Review Landing Page Generator
 *
 * Creates a Shopify template JSON for an editorial product review page.
 *
 * Usage:
 *   node scripts/create-review-page.js <content-file.json>
 *
 * Content file format:
 * {
 *   "slug": "lp-vera-lane-foundation-review",
 *   "hero": { "headline", "subheadline", "category", "bg_image_asset" },
 *   "summary": {
 *     "product_name", "rating", "price_text", "verdict_line",
 *     "image_asset", "label",
 *     "pros": [...], "cons": [...]
 *   },
 *   "sections": [
 *     { "number", "title", "body_text", "image_asset", "image_position" }
 *   ],
 *   "product": { "name", "description", "image", "badge", "cta_text", "cta_url", "features" }
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

  // 1. Hero (reuse bl-hero)
  const heroId = `bl_hero_${generateId()}`;
  sections[heroId] = {
    type: 'bl-hero',
    name: 'BL - Hero',
    settings: {
      section_id: '',
      bg_image_asset: content.hero.bg_image_asset || '',
      bg_color: '#2d2d2d',
      overlay_opacity: 80,
      category: content.hero.category || 'HONEST REVIEW',
      headline: content.hero.headline,
      subheadline: content.hero.subheadline || '',
      show_rating: content.hero.show_rating || false,
      review_count: content.hero.review_count || '',
      cta_text: content.hero.cta_text || 'Read The Review',
      cta_type: 'anchor',
      cta_anchor: 'quick-verdict',
      cta_url: '',
      cta_text_color: '#ffffff',
      cta_border_color: '#ffffff',
    },
  };
  order.push(heroId);

  // 2. Review summary (bl-review-summary)
  const summaryId = `bl_review_summary_${generateId()}`;
  const summaryBlocks = {};
  const summaryBlockOrder = [];

  (content.summary.pros || []).forEach((text) => {
    const id = `pro_${generateId()}`;
    summaryBlocks[id] = { type: 'pro', settings: { text } };
    summaryBlockOrder.push(id);
  });

  (content.summary.cons || []).forEach((text) => {
    const id = `con_${generateId()}`;
    summaryBlocks[id] = { type: 'con', settings: { text } };
    summaryBlockOrder.push(id);
  });

  sections[summaryId] = {
    type: 'bl-review-summary',
    blocks: summaryBlocks,
    block_order: summaryBlockOrder,
    name: 'BL - Review Summary',
    settings: {
      section_id: 'quick-verdict',
      bg_color: '#faf9f7',
      label: content.summary.label || 'QUICK VERDICT',
      product_name: content.summary.product_name,
      rating: content.summary.rating || '4.5',
      price_text: content.summary.price_text || '',
      verdict_line: content.summary.verdict_line || '',
      image_asset: content.summary.image_asset || '',
      image_position: content.summary.image_position || 'left',
      cta_text: 'Read Full Review',
      cta_anchor: 'section-1',
    },
  };
  order.push(summaryId);

  // 3. Review sections (bl-reason-item, alternating left/right)
  (content.sections || []).forEach((section, i) => {
    const sectionId = `bl_reason_item_${generateId()}`;
    sections[sectionId] = {
      type: 'bl-reason-item',
      name: 'BL - Reason Item',
      settings: {
        section_id: `section-${i + 1}`,
        bg_color: '#faf9f7',
        number_prefix: '',
        number: section.number || `${String(i + 1).padStart(2, '0')}`,
        title: section.title,
        body_text: section.body_text,
        link_text: section.link_text || '',
        link_type: section.link_type || 'anchor',
        link_anchor: section.link_anchor || '',
        link_url: section.link_url || '',
        image_asset: section.image_asset || '',
        image_position: section.image_position || (i % 2 === 0 ? 'right' : 'left'),
      },
    };
    order.push(sectionId);
  });

  // 4. Product card (reuse bl-product-card-split)
  const productId = `bl_product_card_split_${generateId()}`;
  const featureBlocks = {};
  const featureOrder = [];

  (content.product.features || []).forEach((label) => {
    const id = `feature_${generateId()}`;
    featureBlocks[id] = { type: 'feature', settings: { label } };
    featureOrder.push(id);
  });

  sections[productId] = {
    type: 'bl-product-card-split',
    blocks: featureBlocks,
    block_order: featureOrder,
    name: 'BL - Product Card Split',
    settings: {
      section_id: 'offer',
      bg_color: '#faf9f7',
      sale_badge: content.product.badge || "EDITOR'S PICK",
      badge_bg: '#d4a574',
      badge_text: '#2d2d2d',
      product_name: content.product.name || 'Vera Lane Tone Adapting Foundation',
      description: content.product.description || '',
      image: content.product.image || '',
      more_colors_text: '+12 More Shades',
      cta_text: content.product.cta_text || 'Try It Today',
      cta_url: content.product.cta_url || '/products/color-changing-foundation',
      cta_bg: '#000000',
      cta_text_color: '#ffffff',
    },
  };
  order.push(productId);

  // 5. Sticky CTA (reuse bl-sticky-cta)
  const stickyCtaId = `bl_sticky_cta_${generateId()}`;
  sections[stickyCtaId] = {
    type: 'bl-sticky-cta',
    name: 'BL - Sticky CTA',
    settings: {
      badge_text: 'HONEST REVIEW',
      promo_text: content.product.promo_text || '#1 Rated Tone Adapting Foundation',
      button_text: content.product.cta_text || 'Try It Today',
      link_url: content.product.cta_url || '/products/color-changing-foundation',
      show_after_scroll: true,
      dismiss_enabled: false,
      bg_color: '#2D2D2D',
      text_color: '#ffffff',
      button_bg: '#D4A574',
      button_text_color: '#2D2D2D',
      badge_bg: '#8B3A3A',
      badge_text_color: '#ffffff',
    },
  };
  order.push(stickyCtaId);

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
    console.error('Usage: node scripts/create-review-page.js <content-file.json>');
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
