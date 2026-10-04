# BRAG v0.6 personal demo pipeline

BRAG is a personal production tool, not a multi-tenant SaaS.

## One command

```bash
npm install
npx playwright install chromium
npm run demo -- https://yourproduct.com 4 "What this product does"
```

This runs the controlled browser workflow and produces:

- `output/demo/package.json`: edit decision list
- `output/demo/narration.txt`: scene-by-scene narration
- `output/recording/`: captured product states and browser footage

## Render

If FFmpeg is installed:

```bash
npm run render
```

The first renderer creates a real MP4 from the captured product states. Narration/TTS and richer motion graphics are intentionally separate layers so the footage remains real.

## Design principle

BRAG is optimized for one person shipping many products:

`build → demo → post → repeat`

There is no account system, billing system, tenant model, or white-label layer.
