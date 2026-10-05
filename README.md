# BRAG

Product-to-video demo engine.

> Turn what you built into a demo people understand.

## Core rule

**AI should be the director, not the camera.**

BRAG uses the real product as footage. It inspects a product, discovers a bounded workflow, captures real states, builds a demo story, plans motion, generates optional local narration, renders MP4s, and quality-checks the result.

## Pipeline

`build → inspect → discover workflow → capture real footage → direct edit → narrate → render → QA → post`

## v1.5

The Director can now evaluate captured states during the browser run.

After each meaningful state, BRAG classifies the result as:

- `hold-result`: strong proof was found, so the run can stop and preserve the result
- `continue`: the state is meaningful but more evidence is needed
- `replan`: the state contains too little visible evidence

This makes capture adaptive rather than purely step-count driven.

## v1.4

BRAG now creates a Director Shot Plan before browser capture.

The plan defines the intended visual beats:

- establish the real product
- capture the primary action
- capture the core interaction
- capture the proof/result
- hold the useful outcome
- close on the clearest action

The runner records the shot goal alongside each captured interaction. Shot planning is advisory and cannot bypass the browser safety policy.

This separates two decisions:

```text
Director: What moment is worth showing?
Camera:   How can I safely capture it?
```

## v1.3

BRAG now preserves the real browser recording produced by Playwright.

The demo package treats that recording as primary product footage for the product-orientation scene, while state screenshots remain useful for precise workflow/result moments.

Pipeline:

```text
real product
  ↓
Playwright recording
  ↓
Director-guided interaction
  ↓
real browser footage + state evidence
  ↓
edit plan
  ↓
voice
  ↓
render
```

The renderer supports video footage as well as screenshots. This keeps the product visible as it actually behaves instead of turning the entire demo into animated screenshots.

Run:

```bash
npm run demo -- https://your-product.com 4 "What this product does"
npm run edit-plan
npm run voice
npm run render
npm run qa
```

## v1.2

The browser runner is now Director-guided.

Before interacting with a product, BRAG derives the product archetype, promise, strongest visible action, and workflow intent. The runner uses those signals to rank safe actions instead of relying only on generic CTA ordering.

Each selected action records the Director decision and captures the click target coordinates for later visual emphasis.

The safety boundary remains unchanged:

- same-origin navigation only
- bounded step count
- destructive/payment/auth actions blocked
- no form submission
- no arbitrary external navigation

Run:

```bash
npm run run -- https://your-product.com 4
```

## v1.1

BRAG's Director now builds a product-intelligence layer before story selection. It classifies the product archetype, extracts the product promise, identifies the strongest visible action, proposes the core workflow, and defines the proof moment.

Run:

```bash
npm run capture -- https://your-product.com
npm run director
```

The intelligence is deterministic and evidence-based. It does not invent product capabilities that were not observed during inspection.

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

## Personal worker

BRAG is personal-first. The browser automation and video rendering stay on your machine so there is no cloud worker bill while the product is being proven.

After the first setup:

```bash
npm install
npx playwright install chromium
npm run build
npm run personal
```

`npm run personal` starts both the BRAG engine and the web control surface, waits for them to become healthy, and opens BRAG in your browser. You no longer need to start `npm run engine` separately.

The architecture is intentionally portable:

```
Personal today
Vercel UI / local UI → BRAG Personal Worker → Playwright + Chromium → FFmpeg → video

Commercial later
BRAG Web App → BRAG Cloud Worker → Playwright + Chromium → FFmpeg → video
```

The same engine can move from the personal worker to a dedicated cloud worker later. That keeps the early version free/open-source while avoiding a throwaway architecture.

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
