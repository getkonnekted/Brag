# BRAG

Product-to-video demo engine MVP.

## MVP

BRAG accepts a product URL, product notes, and screenshots. It generates a demo storyboard and renders a browser-native animated product presentation to WebM using Canvas + MediaRecorder. No paid AI API is required.

## Direction

AI should be the director, not the camera.

Next stages:
1. URL inspection with Playwright
2. GitHub repo analysis
3. Automated workflow capture
4. Remotion composition
5. Local LLM storyboard director
6. Local/open TTS with Kokoro or Piper
7. FFmpeg final rendering

## Run

Serve this folder with any static server, for example `python3 -m http.server 4173`.
