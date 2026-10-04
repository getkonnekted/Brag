# BRAG v0.4 controlled recorder

BRAG now has a controlled browser camera.

## Run

```bash
node recorder.js https://example.com
```

The recorder:

1. Opens the real product.
2. Captures the opening state.
3. Finds high-signal CTAs.
4. Blocks risky actions such as payments, deletion, publishing and account actions.
5. Executes one safe CTA.
6. Captures the resulting state.
7. Writes `output/recording-manifest.json`.
8. Stores Playwright browser footage under `output/footage/`.

## Why one action?

Autonomous browsing needs a safety policy before it becomes multi-step. The recorder is intentionally conservative. The next version should execute a planned sequence only when every step is classified as safe and the destination remains inside the approved origin.
