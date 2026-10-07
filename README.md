# demo.

Product-to-video demo engine.

> Turn what you built into a demo people understand.

## Direction

demo. is now being aligned with the strongest ideas from the open-source BRAG workflow: **inspect first, choose the story, then produce**.

The important separation is:

```
Director → decides what is worth showing
Camera   → captures the evidence
Renderer → turns the edit into a finished video
QA       → decides whether it is safe to ship
```

The repository keeps its existing production engine while adding an explicit evidence-based Director skill under `skills/demo/SKILL.md`.

## Core rule

**AI should be the director, not the camera.**

demo. uses the real product as evidence. It inspects a product, discovers a bounded workflow, captures real states, builds a demo story, plans motion, renders MP4s, and quality-checks the result.

## Pipeline

`inspect → understand → direct → capture → edit → render → QA`

## Director skill

The Director is responsible for:

- understanding what the product actually does
- identifying the audience and strongest promise
- selecting the highest-signal visible workflow
- planning a 15–25 second story
- keeping claims grounded in observed evidence
- making voice optional
- rejecting invented UI, claims, numbers, or workflows

See `skills/demo/SKILL.md`.

## Current engine

The existing engine already contains:

- product inspection
- workflow discovery
- browser control
- adaptive Director decisions
- real browser recording
- edit planning
- motion/framing
- rendering
- optional narration
- QA
- local and remote worker support

The next engineering step is to make the new Director plan the canonical input to production instead of maintaining separate decision logic.

## One-command local flow

```bash
npm install
npx playwright install chromium
npm run demo -- https://your-product.com 4 "What this product does"
npm run render
npm run qa
```

Outputs live under `output/`.

## Personal worker

demo. is personal-first. Browser automation and rendering can stay on a local worker while the control surface remains deployable.

```
Web UI → demo. Worker → Playwright/Chromium → FFmpeg → video
```

Commercial infrastructure can be added later without replacing the Director or production pipeline.

## Principle

`build → demo → post → repeat`

No accounts, billing, tenants, or SaaS layer are required for the personal workflow.
