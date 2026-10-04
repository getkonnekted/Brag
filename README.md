# BRAG

Product-to-video demo engine.

> Turn what you built into a demo people understand.

## Core rule

**AI should be the director, not the camera.**

BRAG uses the real product as footage. It inspects a product, discovers a bounded workflow, captures real states, builds a demo story, plans motion, generates optional local narration, renders MP4s, and quality-checks the result.

## Pipeline

`build → inspect → discover workflow → capture real footage → direct edit → narrate → render → QA → post`

## v1.0

BRAG now has a local Director QA layer.

Run:

```bash
npm run qa
```

QA checks:

- workflow completion and captured states
- browser console errors
- missing footage
- scene duration validity
- caption length risk
- cursor target bounds
- 16:9, 9:16 and 1:1 MP4 existence
- rendered video dimensions
- rendered video duration
- optional narration assets

Reports:

- `output/qa/report.json`
- `output/qa/report.md`

The report produces a 0–100 score and a release status:

- **PASS**: no detected production issues
- **WARNING**: usable, but human review is required
- **FAIL**: do not hand off the MP4 yet

A clean QA report is not a substitute for watching the final video. BRAG is a production assistant, not an autonomous publisher.

## v0.9

Local Piper TTS remains optional:

```bash
PIPER_MODEL=/path/to/voice.onnx npm run voice
npm run render
npm run qa
```

Without Piper, BRAG can render silent video.

## Run locally

```bash
npm install
npx playwright install chromium
npm start
```

Then use `http://localhost:4173`.

For the production pipeline:

```bash
npm run demo -- https://your-product.com 4 "What this product does"
npm run edit-plan
# optional
PIPER_MODEL=/path/to/voice.onnx npm run voice
npm run render
npm run qa
```

Outputs live under `output/`.

BRAG is personal and local. No accounts, billing, tenants, or SaaS layer.
