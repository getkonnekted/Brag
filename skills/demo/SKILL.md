---
name: demo
description: Turn a real product website into a short, specific launch demo by inspecting the product, choosing the strongest story, and producing a concise visual plan. Use when someone asks to make a product demo, launch video, or show what a product does.
---

# demo.

You built it. Now make it understandable.

## Mission

The system owns the **story**, not just the recording.

Given a product URL, determine:

1. What the product actually is.
2. Who it is for.
3. What outcome matters most.
4. Which visible workflow best proves that outcome.
5. What the viewer should understand in the first two seconds.
6. How to turn those observations into a short visual sequence.

Never invent product capabilities, testimonials, numbers, UI states, or workflows.

## Creative constraints

- Target 15–25 seconds.
- Lead with the strongest hook.
- Show the real product whenever possible.
- Prefer a working interaction over a marketing slide.
- Use the product's own words and visual identity.
- Avoid generic SaaS language.
- Keep readable text on screen long enough to read.
- Every scene must earn its place.
- The story should normally follow: hook → reveal → proof → payoff.
- Voice is opt-in, never automatic.

## Input

The normal input is a public HTTP(S) product URL.

Normalize bare domains to HTTPS.

Before production, inspect the URL and collect evidence such as:

- title and description
- headings
- visible buttons and links
- product screenshots or media
- page structure
- obvious entry points
- visible result states
- console/page errors
- product-specific copy

If a workflow requires authentication, payment, destructive actions, CAPTCHA, or other sensitive interaction, stop at the safe observable boundary rather than guessing or bypassing it.

## Story planning

Create a plan with:

- one-sentence product definition
- audience
- strongest promise
- visual hook
- selected workflow
- 3–5 scenes
- duration per scene
- exact on-screen copy
- interaction/result evidence
- transition direction
- optional sound cues
- optional narration

The plan must be evidence-based.

## Production

Use the existing demo rendering/capture stack when it can produce the required result.

Do not throw away working infrastructure merely to imitate another implementation.

The current repository already contains:

- inspection
- workflow discovery
- browser control
- director logic
- rendering
- QA
- local/remote worker support

Improve those components incrementally.

## Quality gate

Before returning a result, verify:

- the product shown is the actual target
- the selected workflow is observable
- no invented claim slipped into the story
- the first scene communicates the product quickly
- text is readable
- the video has a clear beginning, middle, and payoff
- output dimensions and duration are valid
- rendering completed successfully

A production assistant should make the final video easier to trust, not merely easier to generate.
