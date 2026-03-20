# Vera Lane Cosmetics - Shopify Theme

## Store
- Shopify store ID: `1cw77g-ef`
- Live URL: https://veralanecosmetics.com
- Dev server command: `shopify theme dev --store 1cw77g-ef`

## Git Workflow
- Always create a new branch from `main` before making changes
- Never commit directly to `main`
- At the start of every session, pull latest `main` and create a new branch (e.g. `advertorials-march20`)
- Push branches to `origin` for preview via Shopify GitHub integration

## Theme Architecture
- **Default layout** (`layout/theme.liquid`): Includes header and footer — used for standard pages
- **Landing page layout** (`layout/theme.vl-landing.liquid`): No header/footer — used for advertorials and landing pages
- Landing page templates should set `"layout": "theme.vl-landing"` in their JSON
- Custom landing page sections are prefixed with `vl-` (e.g., `vl-lp-header`, `vl-editorial-hero`)
- Blissy-style listicle sections are prefixed with `bl-` (e.g., `bl-hero`, `bl-reason-item`)

## Templates
- `page.vl-advertorial.json` — Advertorial template (uses `theme.vl-landing`)
- `page.lp-li-1.json` — "5 Signs" listicle landing page (uses `theme.vl-landing`)
- `page.lp-why-every-foundation-looks-wrong.json` — "Why Every Foundation Looks Wrong"
- `page.lp-5-things-dermatologists-foundation-after-40.json` — "5 Things Dermatologists"
- `page.vl-alp-lp*.json` — Amazon landing page variants
- `page.vl-product-lp.json` — Product-focused landing page

## Key Products
- Color Changing Foundation (handle: `color-changing-foundation`)

## Landing Page Generator Workflow
1. Write content JSON in `scripts/content/<slug>.json` (hero, 5 reasons, product card)
2. Run `node scripts/create-landing-page.js scripts/content/<file>.json` to generate template
3. Generate images via fal.ai and save to `assets/`
4. Push theme: `shopify theme push --store 1cw77g-ef --theme 185429229846 --allow-live`
5. Commit and push to git
6. Create page via Shopify Admin API (token in `.env` as `SHOPIFY_ACCESS_TOKEN`)
   - `POST /admin/api/2024-01/pages.json` with `template_suffix` matching template filename
   - Store: `1cw77g-ef`, scopes: `read_content,write_content,read_themes,write_themes`

### Image Generation (fal.ai)
- Always use fal.ai, never MCP tools for image generation
- Model: `fal-ai/nano-banana-2` via queue endpoint (`https://queue.fal.run/fal-ai/nano-banana-2`)
- Sync endpoint (`fal.run`) requires auth for nano-banana-2; use async queue instead
- Resolution must be uppercase: `"0.5K"`, `"1K"`, `"2K"`, `"4K"` (not lowercase)
- Auth: `FAL_KEY` env variable, header `Authorization: Key $FAL_KEY`
- Queue workflow: POST to submit → poll status_url → GET response_url for result
- Images go in `assets/` as JPG, referenced via `image_asset` / `bg_image_asset` in templates

### Image Naming Convention
- Hero: `lp-<short-slug>-hero.jpg`
- Reasons: `lp-<short-slug>-reason-1.jpg` through `reason-5.jpg`
- Aspect ratios: hero `16:9`, reasons `3:4`

### Section Asset Image Support
- `bl-hero.liquid`: uses `bg_image_asset` (text setting) as fallback to `bg_image` (image picker)
- `bl-reason-item.liquid`: uses `image_asset` (text setting) as fallback to `image` (image picker)
- Product card still uses `shopify://shop_images/` reference for existing product images

## Shopify CLI
- Dev server: `shopify theme dev --store 1cw77g-ef`
- Push to live: `shopify theme push --store 1cw77g-ef --theme 185429229846 --allow-live`
- Live theme ID: `185429229846` (main-vera-lane/main)
