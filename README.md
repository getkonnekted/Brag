<div align="center">

# demo.

### PRODUCT → STORY → VIDEO

**You built it. Now demo it.**

Turn a real product into a short, cinematic demo people can understand — without recording a thing.

<br />

![Status](https://img.shields.io/badge/status-production-00C853?style=for-the-badge)
![Engine](https://img.shields.io/badge/engine-Playwright%20%2B%20FFmpeg-7C3AED?style=for-the-badge)
![Deployment](https://img.shields.io/badge/deployed-Railway-0B0D0E?style=for-the-badge)
![UI](https://img.shields.io/badge/control%20surface-Vercel-000000?style=for-the-badge)

<br />

**REAL PRODUCT · REAL INTERACTION · REAL PROOF**

</div>

---

## ✦ The idea

Most product demos start with a screen recording.

**demo. starts with the product.**

It studies a real product, finds a useful workflow, captures the real interaction with a browser, and turns that evidence into a finished demo.

> **AI should be the director, not the camera.**

No fake UI.  
No invented workflow.  
No imaginary product states.

Just the real product, directed into a story people can understand.

---

## 🎬 How it works

<div align="center">

**01 · INSPECT**  
Understand the real product

↓  

**02 · DIRECT**  
Choose the strongest story

↓  

**03 · CAPTURE**  
Record the real browser interaction

↓  

**04 · COMPOSE**  
Build the visual story

↓  

**05 · VALIDATE**  
Check the composition

↓  

**06 · RENDER**  
Produce the final video

↓  

**07 · DELIVER**  
16:9 · 1:1 · 9:16

</div>

---

## ⚡ Architecture

```text
                    ┌──────────────────┐
                    │      USER        │
                    │  Product + Story │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ VERCEL           │
                    │ Control Surface  │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ RAILWAY          │
                    │ Production Engine│
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
          INSPECT         DIRECT         CAPTURE
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                    ┌──────────────────┐
                    │ REAL PLAYWRIGHT  │
                    │ PRODUCT FOOTAGE  │
                    └────────┬─────────┘
                             ▼
                    ┌──────────────────┐
                    │ COMPOSITION      │
                    │ + HYPERFRAMES QA │
                    └────────┬─────────┘
                             ▼
                    ┌──────────────────┐
                    │ DETERMINISTIC    │
                    │ FFMPEG RENDERER  │
                    └────────┬─────────┘
                             ▼
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
            16:9            1:1            9:16
```

### Why the split?

The browser and rendering workload is too heavy for the control surface.

So:

**Vercel controls. Railway produces.**

The production worker handles Playwright, Chromium, composition, validation, FFmpeg and final delivery.

---

## 🎥 The production engine

The engine is deliberately evidence-first.

### Director

The Director:

- understands what the product actually does
- identifies the strongest visible promise
- selects a bounded, high-signal workflow
- plans a short demo story
- keeps claims grounded in observed evidence
- avoids invented UI, numbers and workflows

Director guidance:

`skills/demo/SKILL.md`

### Browser

Real browser automation captures the product itself.

**Playwright + Chromium**

### Validator

Hyperframes checks the composition before delivery:

- layout
- motion
- contrast
- lint
- runtime

Hyperframes is the **validator**, not the final production renderer.

### Renderer

Deterministic FFmpeg produces the final delivery artifact.

Current rendering includes:

| Capability | |
|---|---|
| Real product footage | ✓ |
| Cinematic camera movement | ✓ |
| Animated typography | ✓ |
| Story / product copy | ✓ |
| Framing + vignette | ✓ |
| Narration when available | ✓ |
| Audio fallback | ✓ |
| H.264 video | ✓ |
| AAC audio | ✓ |
| 16:9 output | ✓ |
| 1:1 output | ✓ |
| 9:16 output | ✓ |

---

## 🧠 The rule

### Don't invent what the product can do.

The browser is the source of truth.

```text
Observed
   ↓
Understood
   ↓
Directed
   ↓
Captured
   ↓
Rendered
   ↓
Delivered
```

If the browser didn't observe it, the demo shouldn't claim it.

---

## 📦 Output

A successful production run generates:

```text
output/final/
├── brag.mp4
├── product-demo-1x1.mp4
├── product-demo-9x16.mp4
└── production.json
```

Three delivery formats.  
One production run.

---

## 🛠️ Stack

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=next.js&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat-square&logo=playwright&logoColor=white)
![FFmpeg](https://img.shields.io/badge/FFmpeg-007808?style=flat-square&logo=ffmpeg&logoColor=white)
![Railway](https://img.shields.io/badge/Railway-0B0D0E?style=flat-square&logo=railway&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)

</div>

---

## 🚀 Local development

Install:

```bash
npm install
npx playwright install chromium
```

Run the control surface:

```bash
npm run dev
```

The production browser worker should be run using the engine scripts and configuration defined by the repository.

---

## 📁 Repository

```text
app/                    → demo. control surface
skills/demo/            → Director skill
server.js               → production worker
hyperframes-render.js   → validation + renderer
output/                 → generated artifacts
```

---

## 🟢 Current status

**Production-ready engine online.**

The current production architecture:

```
Vercel
  ↓
Railway
  ↓
Playwright
  ↓
Hyperframes validation
  ↓
FFmpeg
  ↓
16:9 · 1:1 · 9:16
```

The renderer now includes cinematic motion, typography and audio while preserving real Playwright product footage.

---

## ✦ Principles

**01 — Real product first**  
The footage comes from the actual product.

**02 — Evidence over imagination**  
Observed behaviour beats invented claims.

**03 — Director, not camera**  
AI decides the story. Automation captures the evidence.

**04 — Short and clear**  
One strong story is better than a feature dump.

**05 — Reliable production**  
Validation and rendering have separate responsibilities.

**06 — Personal first**  
No accounts, billing or SaaS complexity required for the core workflow.

---

<div align="center">

### build → demo → post → repeat

**Built for people who have something real to show.**

<br />

<sub>demo. · Product → Story → Video</sub>

</div>
