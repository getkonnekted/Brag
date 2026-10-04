# BRAG v0.3 workflow discovery

The workflow engine sits between inspection and recording.

## What it does

- Opens a real product with Playwright
- Finds visible links, buttons, submit controls and forms
- Extracts labels, URLs, positions and form fields
- Scores obvious high-signal CTAs such as Start, Try, Demo, Sign up, Create, Book, Order and Play
- Produces `output/workflow.json`

## Run

```bash
node workflow.js https://example.com
```

## Current limitation

BRAG does **not** blindly click production CTAs yet. Authentication, payments, destructive actions, CAPTCHAs and external redirects need explicit safety rules before autonomous interaction.

The next camera milestone is a controlled browser session that can execute safe GET/navigation flows and capture each step.
