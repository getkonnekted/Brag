# BRAG v0.2 architecture

BRAG is split into four stages:

1. **Inspector**: Playwright opens a real product URL and extracts title, description, headings, links, actions, console errors, network activity and a full-page screenshot.
2. **Director**: the inspection becomes a deterministic storyboard. The director chooses workflow signals before an LLM is introduced.
3. **Camera**: the existing browser Canvas studio renders the storyboard. The next camera step is Playwright action recording.
4. **Voice**: a later open local TTS engine turns each scene into narration.

## Local flow

`npm install`

`npx playwright install chromium`

`npm run capture -- https://example.com`

`node director.js`

Or run `npm start` and POST `{"url":"https://example.com"}` to `/api/inspect`.

## Design rule

**The product itself is the footage. AI directs the footage.**

Do not replace real product interaction with generic AI-generated UI footage.
