# BRAG v0.5 multi-step recording

BRAG can now execute a bounded, safe product workflow instead of stopping after one CTA.

## Run

```bash
node runner.js https://example.com 4
```

The runner:

1. Opens the real product.
2. Captures the current state.
3. Finds visible actions.
4. Scores actions against a conservative safety policy.
5. Executes the strongest unseen safe action.
6. Captures the resulting state.
7. Repeats up to the configured step limit.
8. Writes a recording manifest and Playwright video footage.

## Safety boundary

The runner is deliberately conservative:

- same-origin navigation only
- maximum 6 steps
- no login or password actions
- no payment or checkout actions
- no deletion or destructive actions
- no publishing or deployment
- no file upload/download actions
- no external redirects
- no form submit controls

This is a demo camera, not an unrestricted browser agent.

## Output

`output/recording/manifest.json`

`output/recording/step-XX-before.png`

`output/recording/step-XX-after.png`

`output/recording/video/`

The manifest becomes the input for the next BRAG layer: turning recorded states into a coherent narrated video.
