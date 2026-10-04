# BRAG

Product-to-video demo engine.

## v0.2

BRAG now has a real product inspection layer using Playwright. Give it a live URL and it can inspect the page, collect product signals, detect console errors, and produce a deterministic demo storyboard.

### Run locally

```bash
npm install
npx playwright install chromium
npm start
```

Then use the browser at `http://localhost:4173`.

For CLI capture:

```bash
npm run capture -- https://example.com
node director.js
```

Output is written to `output/`.

## MVP

- Product URL
- Product notes
- Screenshot upload
- Storyboard generation
- Browser-based demo preview
- WebM recording
- Playwright URL inspection
- Deterministic director

## Roadmap

`URL / repo → inspect → discover workflow → record real product → direct edit → render → publish`

**Core rule: AI should be the director, not the camera.**


## v0.7

BRAG now produces a visual edit plan from real captured product states.

- Motion direction per scene
- Cursor target metadata when available
- Caption and safe-area rules
- 16:9, 9:16, and 1:1 output targets
- Crossfade/cut transition instructions

The tool remains personal and local.

## v0.8

BRAG now renders the edit plan into actual video.

- Motion-aware scene rendering
- Slow zoom and directional push effects
- Real product screenshots as footage
- Cursor target highlighting
- Scene labels and narration captions
- Crossfade transitions
- 16:9, 9:16, and 1:1 MP4 outputs

Run:

```bash
npm run demo -- https://your-product.com 4 "What this product does"
npm run render
```

Outputs:

- `output/render/brag-demo-16x9.mp4`
- `output/render/brag-demo-9x16.mp4`
- `output/render/brag-demo-1x1.mp4`

BRAG is still a personal, local production tool. No accounts, billing, tenants, or SaaS layer.
