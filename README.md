# demo.

**PRODUCT → STORY → VIDEO**

> You built it. Now demo it.

demo. turns a real product into a short, cinematic demo people can understand — without you recording a thing.

## What it does

demo. studies a real product, finds a useful workflow, captures the real product with Playwright, and turns the evidence into a finished demo video.

**No fake UI. No invented workflow. Real product. Real interaction. Real proof.**

The core principle is:

> **AI should be the director, not the camera.**

The Director decides **what is worth showing**. The browser captures **what actually happened**. The renderer turns that evidence into a finished video. QA decides whether it is safe to ship.

## Architecture

The production system is split into a lightweight control surface and a browser/rendering worker:

```
User
  ↓
Vercel control surface
  ↓
Railway production engine
  ↓
Inspect → Direct → Capture
  ↓
Real Playwright browser footage
  ↓
Composition + Hyperframes validation
  ↓
Deterministic FFmpeg renderer
  ↓
Quality gate
  ↓
16:9 + 1:1 + 9:16
```

### Control surface

The web UI runs on Vercel.

It handles:

- product URL and description input
- production progress
- stage/status reporting
- artifact delivery
- transient polling recovery

The production browser and rendering workload does **not** run on Vercel.

### Production engine

The worker runs on Railway and handles the heavy work:

- Playwright / Chromium
- product inspection
- workflow discovery
- browser recording
- composition
- Hyperframes validation
- FFmpeg rendering
- quality checks
- final artifact generation

The public production worker is configured through:

`NEXT_PUBLIC_BRAG_ENGINE_URL`

## Production pipeline

```
PRODUCT
   ↓
INSPECT
   ↓
UNDERSTAND
   ↓
DIRECT
   ↓
CAPTURE REAL PRODUCT
   ↓
EDIT / COMPOSE
   ↓
HYPERFRAMES CHECK
   ↓
FFMPEG RENDER
   ↓
QUALITY GATE
   ↓
DELIVER
```

The production engine is deliberately evidence-first. A demo should be based on what the browser actually observed rather than an imagined version of the product.

## Rendering

Hyperframes is used as a **composition validator**. It checks the planned composition for layout, motion, contrast, lint, and runtime problems before delivery.

The final production renderer uses deterministic FFmpeg.

The renderer currently supports:

- real browser footage
- cinematic camera movement
- animated typography
- product/story copy
- vignette and framing
- optional narration when available
- an audio fallback when narration is unavailable
- H.264 video
- AAC audio
- 16:9, 1:1 and 9:16 delivery

This separation is intentional: Hyperframes validates the composition; deterministic FFmpeg produces the delivery artifact reliably within the production worker's resource limits.

## Director

The Director is responsible for:

- understanding what the product actually does
- identifying the strongest visible promise
- selecting a bounded, high-signal workflow
- planning a short demo story
- keeping claims grounded in observed evidence
- choosing useful copy
- avoiding invented UI, numbers, claims, or workflows

Director guidance lives under:

`skills/demo/SKILL.md`

## Repository structure

Important areas include:

```
app/                    # demo. web control surface
skills/demo/            # Director skill
server.js               # production worker entry point
hyperframes-render.js   # composition validation + deterministic renderer
output/                 # generated production artifacts
```

The exact repository structure may evolve as the production pipeline evolves.

## Local development

Install dependencies:

```bash
npm install
npx playwright install chromium
```

Run the application using the repository's available scripts:

```bash
npm run dev
```

For the production browser worker, use the engine scripts/configuration defined by the repository rather than assuming that the Vercel control surface can perform browser rendering itself.

## Output

A successful production run generates the final demo artifacts under `output/final/`, including:

```
brag.mp4
product-demo-1x1.mp4
product-demo-9x16.mp4
production.json
```

The exact filenames are retained for compatibility with the current production pipeline.

## Design principles

### 1. Real product first

The source footage comes from the actual product.

### 2. Evidence over imagination

If the browser did not observe it, the demo should not claim it.

### 3. Director, not camera

AI decides the story. Automation captures the evidence.

### 4. Short and understandable

The goal is not to document every feature. It is to make one useful product story obvious.

### 5. Production reliability

The final renderer should be deterministic and resource-conscious. Validation and rendering are separate responsibilities.

### 6. Personal-first

The system is designed to be useful without accounts, billing, tenants, or a large SaaS layer.

## Current status

The production engine is deployed remotely on Railway and the control surface is deployed on Vercel.

The current production renderer has been updated to add cinematic motion, typography and audio while retaining the real Playwright footage and Hyperframes validation step.

## The loop

```
build → demo → post → repeat
```

Built for people who have something real to show.
