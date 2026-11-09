# crypto-blog

The public, server-rendered site of the crypto exchange (`apps/web`) and its CMS (`apps/cms`): coin pages, top and newest coins, markets, campaigns, and articles. It reads live data from the exchange backend ([mdastpak/Crypto-Exchange](https://github.com/mdastpak/Crypto-Exchange)) and editorial content from a headless [Payload](https://payloadcms.com) CMS.

See [docs/architecture.md](docs/architecture.md) for how the pieces fit together and the [roadmap epic](https://github.com/mdastpak/crypto-blog/issues/11) for what is planned.

## Requirements

- Node.js 22 (see `.nvmrc`)
- pnpm 10 (`corepack enable` picks the version in `package.json`)

## Getting started

```sh
corepack enable
pnpm install
cp apps/web/.env.example apps/web/.env.local   # then edit it
pnpm dev                                        # http://localhost:3000
```

## Scripts

Run from the repository root.

| Script                              | What it does                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Development server with hot reload                                                       |
| `pnpm build`                        | Production build (standalone server in `apps/web/.next/standalone`)                      |
| `pnpm start`                        | Runs the production build the way the container image does                               |
| `pnpm lint`                         | ESLint                                                                                   |
| `pnpm typecheck`                    | TypeScript, no emit                                                                      |
| `pnpm test`                         | Unit and component tests (Vitest)                                                        |
| `pnpm test:e2e`                     | End-to-end smoke tests (Playwright) against the production build; run `pnpm build` first |
| `pnpm format` / `pnpm format:check` | Prettier                                                                                 |

## Configuration

The web app reads its configuration from environment variables once, at start-up. An invalid or missing value stops the process with a list of every problem, so a misconfigured node never joins the load balancer. `next build` needs none of them: pages render on their first request and are cached from then on.

| Variable                 | Default                        | Meaning                                                                |
| ------------------------ | ------------------------------ | ---------------------------------------------------------------------- |
| `BACKEND_API_URL`        | required                       | Base URL of the exchange API, e.g. `https://api.example.com/api/v1`    |
| `PUBLIC_SITE_URL`        | required                       | Public URL of this site, for canonical URLs                            |
| `DEPLOYMENT_REGION`      | `ir`                           | Release region, the same value as the backend: `ir` or `international` |
| `MARKET_QUOTES`          | `USDT,IRT`                     | The quotes the exchange lists every currency against (markets pages)   |
| `BACKEND_TIMEOUT_MS`     | `5000`                         | Timeout of one request to the backend                                  |
| `SHUTDOWN_DRAIN_SECONDS` | `10`                           | How long a node keeps serving after SIGTERM (see below)                |
| `LOG_LEVEL`              | `info`                         | `debug`, `info`, `warn`, or `error`                                    |
| `PORT`, `HOSTNAME`       | `3000`, `0.0.0.0` in the image | Where the server listens                                               |

## Health checks and shutdown

| Route                   | Answer                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /api/health/live`  | `200` while the process runs                                                                              |
| `GET /api/health/ready` | `200` while the node should receive traffic; `503` with `reason` `draining` or `invalid_config` otherwise |

Readiness does not depend on the backend or the CMS: if they fail, every node would leave the load balancer at once, while cached pages could still be served.

On SIGTERM or SIGINT, readiness turns to `503` at once and the process exits after `SHUTDOWN_DRAIN_SECONDS`, so the load balancer drains it without failing requests in flight. This needs `NEXT_MANUAL_SIG_HANDLE=true`, which the image and `pnpm start` set; otherwise Next.js stops at once.

## Container image

```sh
docker build -t crypto-blog-web .
docker run -p 3000:3000 \
  -e BACKEND_API_URL=https://api.example.com/api/v1 \
  -e PUBLIC_SITE_URL=https://blog.example.com \
  crypto-blog-web
```

The image runs as a non-root user and holds only the standalone server. It keeps no state on disk, so any number of replicas can run behind a load balancer, sharing one Redis cache (`CACHE_REDIS_URL` or Sentinel/Cluster settings). See [docs/deployment.md](docs/deployment.md) for the shared cache, security headers, logs, and traces, an example `deploy/docker-compose.yml` with two nodes, and a Kubernetes sketch; and [docs/operations.md](docs/operations.md) for the runbook.

## CMS

Articles and campaigns live in a Payload CMS in `apps/cms`; see [docs/cms.md](docs/cms.md) to run it, its roles, and its deployment.

## News worker

`apps/news-worker` collects crypto news from RSS and Atom feeds into a store of stories, drafts news from them into the CMS for editors to review, and posts published news to Telegram and X; see [docs/news.md](docs/news.md).

## Search engines

Sitemaps, hreflang links, structured data, Open Graph images, and 410s for removed coins: see [docs/seo.md](docs/seo.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
