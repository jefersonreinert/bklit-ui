# whatsapp-web.js bridge (Render free web service)
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=10000

# Run as the image's unprivileged "node" user; it must own the working dir
# (whatsapp-web.js writes the session and its cache there)
WORKDIR /home/node/bridge
RUN chown node:node /home/node/bridge
USER node
COPY --chown=node:node package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --chown=node:node . .

EXPOSE 10000
CMD ["node", "server.mjs"]
