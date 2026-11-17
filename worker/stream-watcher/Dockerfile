# SOCIA stream watcher. Build from the repository root:
#   fly deploy --config worker/stream-watcher/fly.toml
FROM node:24-slim
WORKDIR /app
COPY worker/stream-watcher/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
# Only what the watcher runs: the shared stream code and the watcher itself.
COPY lib/streams ./lib/streams
COPY worker/stream-watcher/index.ts ./worker/stream-watcher/index.ts
ENV NODE_ENV=production
CMD ["npx", "tsx", "worker/stream-watcher/index.ts"]
