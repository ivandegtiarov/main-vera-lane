#!/usr/bin/env node

/**
 * Vera Lane Comparison Landing Page Generator
 *
 * Creates a Shopify template JSON for a brand comparison/review landing page.
 *
 * Usage:
 *   node scripts/create-comparison-page.js <content-file.json>
 *
 * Content file format:
 * {
 *   "slug": "lp-comparison-foundation-review",
 *   "hero": { "headline", "subheadline", "category", "bg_image_asset" },
 *   "brands": [
 *     { "name", "number", "badge_text", "rating", "price_text", "image_asset",
 *       "review_text", "pros": [...], "cons": [...], "verdict" }
 *   ],
 *   "comparison": {
 *     "heading", "subheading",
 *     "brand_names": ["Brand1", ...],
 *     "criteria": [{ "name": "Coverage", "values": ["Excellent", "Good", ...] }]
 *   },
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
      category: content.hero.category || 'INDEPENDENT REVIEW',
      headline: content.hero.headline,
      subheadline: content.hero.subheadline || '',
      show_rating: false,
      review_count: '',
      cta_text: 'See The Results',
      cta_type: 'anchor',
      cta_anchor: 'brand-1',
      cta_url: '',
      cta_text_color: '#ffffff',
      cta_border_color: '#ffffff',
    },
  };
  order.push(heroId);

  // 2. Brand reviews (5x bl-brand-review)
  content.brands.forEach((brand, i) => {
    const reviewId = `bl_brand_review_${generateId()}`;

    const blocks = {};
    const blockOrder = [];

    (brand.pros || []).forEach((text) => {
      const id = `pro_${generateId()}`;
      blocks[id] = { type: 'pro', settings: { text } };
      blockOrder.push(id);
    });

    (brand.cons || []).forEach((text) => {
      const id = `con_${generateId()}`;
      blocks[id] = { type: 'con', settings: { text } };
      blockOrder.push(id);
    });

    sections[reviewId] = {
      type: 'bl-brand-review',
      blocks,
      block_order: blockOrder,
      name: 'BL - Brand Review',
      settings: {
        section_id: `brand-${i + 1}`,
        bg_color: '#faf9f7',
        number: brand.number || `#${i + 1}`,
        badge_text: brand.badge_text || '',
        brand_name: brand.name,
        rating: brand.rating || '4',
        price_text: brand.price_text || '',
        review_text: brand.review_text,
        verdict: brand.verdict || '',
        image_asset: brand.image_asset || '',
        image_position: i % 2 === 0 ? 'right' : 'left',
      },
    };
    order.push(reviewId);
  });

  // 3. Comparison table (bl-comparison-table)
  const tableId = `bl_comparison_table_${generateId()}`;
  const tableBlocks = {};
  const tableBlockOrder = [];

  content.comparison.criteria.forEach((criterion) => {
    const id = `criterion_${generateId()}`;
    tableBlocks[id] = {
      type: 'criterion',
      settings: {
        criterion: criterion.name,
        brand_1_value: criterion.values[0],
        brand_2_value: criterion.values[1],
        brand_3_value: criterion.values[2],
        brand_4_value: criterion.values[3],
        brand_5_value: criterion.values[4],
      },
    };
    tableBlockOrder.push(id);
  });

  sections[tableId] = {
    type: 'bl-comparison-table',
    blocks: tableBlocks,
    block_order: tableBlockOrder,
    name: 'BL - Comparison Table',
    settings: {
      section_id: 'comparison',
      bg_color: '#faf9f7',
      heading: content.comparison.heading || 'How They Compare',
      subheading: content.comparison.subheading || '',
      brand_1_name: content.comparison.brand_names[0],
      brand_2_name: content.comparison.brand_names[1],
      brand_3_name: content.comparison.brand_names[2],
      brand_4_name: content.comparison.brand_names[3],
      brand_5_name: content.comparison.brand_names[4],
    },
  };
  order.push(tableId);

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
      product_name: content.product.name || 'Vera Lane Color Changing Foundation',
      description: content.product.description || '',
      image: content.product.image || '',
      more_colors_text: '+12 More Shades',
      cta_text: content.product.cta_text || 'Try It Today',
      cta_url: content.product.cta_url || 'shopify://products/color-changing-foundation',
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
      badge_text: "EDITOR'S PICK",
      promo_text: content.product.badge || '#1 Color-Changing Foundation',
      button_text: content.product.cta_text || 'Try It Today',
      link_url: content.product.cta_url || 'shopify://products/color-changing-foundation',
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
    console.error('Usage: node scripts/create-comparison-page.js <content-file.json>');
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
  console.log(`  1. Push theme: shopify theme push --store 1cw77g-ef --theme 185429229846 --allow-live`);
  console.log(`  2. Create page via Shopify Admin API with template_suffix: ${slug}`);
}

module.exports = { buildTemplate, generateId };
