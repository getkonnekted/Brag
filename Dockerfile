FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg espeak-ng \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install --ignore-scripts

COPY . .

ENV NODE_ENV=production
ENV HYPERFRAMES_NO_UPDATE_CHECK=1
ENV PRODUCER_FORCE_SCREENSHOT=true
ENV PRODUCER_LOW_MEMORY_MODE=true
ENV HYPERFRAMES_BROWSER_PATH=/ms-playwright/chromium-1194/chrome-linux/chrome
ENV PRODUCER_HEADLESS_SHELL_PATH=/ms-playwright/chromium-1194/chrome-linux/chrome

RUN test -x "$HYPERFRAMES_BROWSER_PATH" \
  && node --check server.js \
  && node --check brag.js \
  && node --check capture.js \
  && node --check director.js \
  && node --check runner.js \
  && node --check hyperframes-compose.js \
  && node --check hyperframes-render.js

EXPOSE 3000

CMD ["node", "server.js"]
