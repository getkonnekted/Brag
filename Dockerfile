FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg espeak-ng \
  && rm -rf /var/lib/apt/lists/*

# Playwright image revisions and directory layouts can change.
# Discover the installed Chromium executable instead of hard-coding a revision.
RUN browser="$(find /ms-playwright -type f -name chrome -perm -111 | head -n 1)" \
  && test -n "$browser" \
  && test -x "$browser" \
  && ln -sf "$browser" /usr/local/bin/hyperframes-chromium

COPY package*.json ./

RUN npm install --ignore-scripts

COPY . .

ENV NODE_ENV=production
ENV HYPERFRAMES_NO_UPDATE_CHECK=1
ENV PRODUCER_FORCE_SCREENSHOT=true
ENV PRODUCER_LOW_MEMORY_MODE=true
ENV HYPERFRAMES_BROWSER_PATH=/usr/local/bin/hyperframes-chromium
ENV PRODUCER_HEADLESS_SHELL_PATH=/usr/local/bin/hyperframes-chromium

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
