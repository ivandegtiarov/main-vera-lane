# Vera Lane Cosmetics - Shopify Theme

## Store
- Shopify store ID: `1cw77g-ef`
- Live URL: https://veralanecosmetics.com
- Dev server command: `shopify theme dev --store 1cw77g-ef`

## Git Workflow
- Always create a new branch from `main` before making changes
- Never commit directly to `main`
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
- `page.vl-alp-lp*.json` — Amazon landing page variants
- `page.vl-product-lp.json` — Product-focused landing page

## Key Products
- Color Changing Foundation (handle: `color-changing-foundation`)
