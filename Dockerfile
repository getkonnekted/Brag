FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app

RUN apt-get update \
  && apt-get install -y ffmpeg espeak-ng \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install
RUN npx hyperframes browser ensure

COPY . .

ENV NODE_ENV=production

CMD ["node", "server.js"]
