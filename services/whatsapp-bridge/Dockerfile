# WhatsApp bridge (Baileys, no browser) — Render free web service
FROM node:22-bookworm-slim

# git: some Baileys dependencies are fetched from GitHub
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=10000

WORKDIR /home/node/bridge
RUN chown node:node /home/node/bridge
USER node
COPY --chown=node:node package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --chown=node:node . .

EXPOSE 10000
CMD ["node", "--max-old-space-size=384", "server.mjs"]
