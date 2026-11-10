# syntax=docker/dockerfile:1
# Images of the blog. Build from the repository root:
#   docker build -t crypto-blog-web .                          # the web app (default)
#   docker build --target cms -t crypto-blog-cms .             # the CMS
#   docker build --target cms-migrate -t crypto-blog-cms-migrate .  # its migration job
#   docker build --target news-worker -t crypto-blog-news .    # the news worker (and its migrations)

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/cms/package.json apps/cms/
COPY apps/news-worker/package.json apps/news-worker/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build-web
# The media CDN the Content-Security-Policy lets images come from; fixed at
# build time, and the server refuses a different CMS_MEDIA_URL at run time.
ARG CMS_MEDIA_URL=
COPY . .
RUN pnpm --filter web build

FROM deps AS build-cms
COPY . .
RUN pnpm --filter cms build

# Runs the CMS's pending migrations once per release, under a lock:
#   docker run --rm -e DATABASE_URL=… -e PAYLOAD_SECRET=… -e CMS_PUBLIC_URL=… crypto-blog-cms-migrate
FROM build-cms AS cms-migrate
ENV NODE_ENV=production
WORKDIR /repo/apps/cms
USER node
CMD ["node", "--import", "tsx", "src/migrate.ts"]

FROM node:${NODE_VERSION}-alpine AS cms
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app
COPY --from=build-cms --chown=app:app /repo/apps/cms/.next/standalone ./
COPY --from=build-cms --chown=app:app /repo/apps/cms/.next/static ./apps/cms/.next/static
USER app
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health/live" >/dev/null || exit 1
CMD ["node", "apps/cms/server.js"]

# The news worker runs its TypeScript with tsx, with production dependencies only.
# Its migrations: docker run --rm -e DATABASE_URL=… crypto-blog-news node --import tsx src/migrate.ts
FROM base AS news-worker
ENV NODE_ENV=production PORT=3002
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/news-worker/package.json apps/news-worker/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter news-worker...
COPY apps/news-worker/src apps/news-worker/src
WORKDIR /repo/apps/news-worker
USER node
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health/live" >/dev/null || exit 1
CMD ["node", "--import", "tsx", "src/main.ts"]

FROM node:${NODE_VERSION}-alpine AS web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_MANUAL_SIG_HANDLE=true \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app
COPY --from=build-web --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=build-web --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build-web --chown=app:app /repo/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health/live" >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
