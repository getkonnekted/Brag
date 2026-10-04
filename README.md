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

`URL / GitHub repo → inspect → discover workflow → operate real app → capture footage → narration → final demo`

**Core rule: AI should be the director, not the camera.**
