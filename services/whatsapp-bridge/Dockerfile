# whatsapp-web.js bridge (Render free web service)
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=7860

RUN useradd -m -u 1000 app || true
WORKDIR /home/app/bridge
COPY --chown=1000 package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --chown=1000 . .
USER 1000

EXPOSE 7860
CMD ["node", "server.mjs"]
