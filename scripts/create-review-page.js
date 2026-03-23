#!/usr/bin/env node

/**
 * Vera Lane Editorial Product Review Landing Page Generator
 *
 * Creates a Shopify template JSON using vl-* editorial sections
 * for a long-form single-product review page.
 *
 * Usage:
 *   node scripts/create-review-page.js <content-file.json>
 *
 * Content file format:
 * {
 *   "slug": "lp-vera-lane-foundation-review",
 *   "hero": { "meta_text", "headline", "intro_text", "image", "caption" },
 *   "summary": { "product_name", "rating", "price_text", "verdict_line", "image_asset", "pros": [...], "cons": [...] },
 *   "body": [
 *     { "type": "rich_text", "subheading", "content" },
 *     { "type": "image_text", "image", "image_caption", "heading", "text" },
 *     { "type": "pull_quote", "quote", "attribution" },
 *     { "type": "cta", "text", "button_text", "button_url", "subtext" }
 *   ],
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

  // 1. Editorial Hero
  const heroId = `vl_editorial_hero_${generateId()}`;
  sections[heroId] = {
    type: 'vl-editorial-hero',
    name: 'VL Editorial Hero',
    settings: {
      meta_text: content.hero.meta_text || 'HONEST REVIEW',
      headline: content.hero.headline,
      intro_text: content.hero.intro_text || '',
      image: content.hero.image || '',
      image_alt: content.hero.image_alt || '',
      caption: content.hero.caption || '',
      bg_color: '#ffffff',
      headline_color: '#000000',
      text_color: '#333333',
      meta_color: '#666666',
    },
  };
  order.push(heroId);

  // 2. Review Summary (bl-review-summary — keeps the quick verdict card)
  if (content.summary) {
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
        image: content.summary.image || '',
        image_asset: content.summary.image_asset || '',
        image_position: content.summary.image_position || 'left',
        cta_text: 'Read Full Review',
        cta_anchor: 'full-review',
      },
    };
    order.push(summaryId);
  }

  // 3. Body sections — mixed vl-rich-text, vl-image-text, vl-pull-quote, vl-cta-block
  (content.body || []).forEach((block, i) => {
    switch (block.type) {
      case 'rich_text': {
        const id = `vl_rich_text_${generateId()}`;
        sections[id] = {
          type: 'vl-rich-text',
          name: 'VL Rich Text',
          settings: {
            subheading: block.subheading || '',
            content: block.content,
            bg_color: block.bg_color || '#ffffff',
            heading_color: '#000000',
            text_color: '#333333',
            link_color: '#5C1A33',
          },
        };
        // First body section gets the anchor
        if (i === 0) {
          sections[id].settings.section_id = 'full-review';
        }
        order.push(id);
        break;
      }

      case 'image_text': {
        const id = `vl_image_text_${generateId()}`;
        sections[id] = {
          type: 'vl-image-text',
          name: 'VL Image + Text',
          settings: {
            image: block.image || '',
            image_asset: block.image_asset || '',
            image_alt: block.image_alt || '',
            image_caption: block.image_caption || '',
            heading: block.heading || '',
            text: block.text || '',
            bg_color: block.bg_color || '#ffffff',
            heading_color: '#000000',
            text_color: '#333333',
          },
        };
        order.push(id);
        break;
      }

      case 'pull_quote': {
        const id = `vl_pull_quote_${generateId()}`;
        sections[id] = {
          type: 'vl-pull-quote',
          name: 'VL Pull Quote',
          settings: {
            quote: block.quote,
            attribution: block.attribution || '',
            bg_color: block.bg_color || '#F5EDE8',
            quote_color: '#333333',
            accent_color: '#5C1A33',
            attribution_color: '#666666',
          },
        };
        order.push(id);
        break;
      }

      case 'cta': {
        const id = `vl_cta_block_${generateId()}`;
        sections[id] = {
          type: 'vl-cta-block',
          name: 'VL CTA Block',
          settings: {
            text: block.text || '',
            button_url: block.button_url || '/products/color-changing-foundation',
            button_text: block.button_text || 'TRY IT TODAY',
            subtext: block.subtext || '',
            bg_color: block.bg_color || '#ffffff',
            text_color: '#333333',
            button_bg_color: '#5C1A33',
            button_text_color: '#ffffff',
          },
        };
        order.push(id);
        break;
      }
    }
  });

  // 4. Sticky CTA
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
