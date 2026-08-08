# Loop API — Express + Socket.IO + cron
# Build from the repo root:  docker build -f apps/api/Dockerfile -t loop-api .
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl curl

# ── dependencies ─────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci --omit=dev --ignore-scripts --workspace @loop/api --workspace @loop/db --workspace @loop/shared --include-workspace-root

# ── runtime ──────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# Prisma client is generated at build time so the image starts instantly.
RUN npx prisma generate --schema packages/db/prisma/schema.prisma

RUN addgroup -S loop && adduser -S loop -G loop && mkdir -p /app/apps/api/uploads && chown -R loop:loop /app
USER loop

WORKDIR /app/apps/api
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:4000/api/health || exit 1

CMD ["npx", "tsx", "src/index.ts"]
