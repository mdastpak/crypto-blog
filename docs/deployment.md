# Deployment

The blog runs as any number of identical web nodes behind a load balancer, with the CMS, the news worker, PostgreSQL, and one shared Redis. The work of [#10](https://github.com/mdastpak/crypto-blog/issues/10). Day-to-day operation: [operations.md](operations.md).

```
            ┌──────── edge: TLS, rate limits, X-Forwarded-*, X-Request-ID
            ▼
   web-1 … web-n  ──── Redis (shared page and fetch cache, tag marks)
     │      │
     │      └───────── exchange backend (market data, sites)
     └──────────────── CMS (articles)  ◀── news worker
```

Examples: [`deploy/docker-compose.yml`](../deploy/docker-compose.yml) (two web nodes, an nginx balancer, Redis, the CMS, PostgreSQL, the news worker) and [`deploy/k8s/web.yaml`](../deploy/k8s/web.yaml) (a Deployment, PDB, and HPA sketch).

## No state on a node

A node keeps nothing that another node needs:

- **Pages, route handlers, and fetch results** go to the shared cache (below). A page rendered on one node is served by every node.
- **The catalog copy** behind sitemaps and 410s ([seo.md](seo.md)) is per node and follows the backend's feed; nodes converge within five minutes.
- **Cookies** are only the visitor's choices: `locale`, `theme`, and the session cookie that the country-site check ran ([sites.md](sites.md)). There are no sessions.
- **Disk**: none, besides Next.js's image optimizer scratch space under `.next/cache`, which may be an empty, per-pod volume.

## The shared cache

Next.js's cache handler is replaced by one on Redis (`apps/web/src/lib/cache`, wired in `next.config.ts`). Its per-process memory cache is off (`cacheMaxMemorySize: 0`), so a node never serves a page that the others have replaced.

| Variable                                                          | Meaning                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `CACHE_REDIS_URL`                                                 | one Redis server, `redis://` or `rediss://`                                  |
| `CACHE_REDIS_SENTINELS`, `CACHE_REDIS_MASTER`                     | a Sentinel group (`host:port,…`) and its master name; failovers are followed |
| `CACHE_REDIS_CLUSTER`                                             | a Redis Cluster (`host:port,…`)                                              |
| `CACHE_REDIS_USERNAME`, `CACHE_REDIS_PASSWORD`, `CACHE_REDIS_TLS` | credentials and TLS for Sentinel and Cluster                                 |
| `CACHE_KEY_PREFIX`                                                | `crypto-blog`; give each deployment sharing one Redis its own                |
| `CACHE_CLOCK_SKEW_MS`                                             | `1000`; how far node clocks may differ                                       |
| `CACHE_MAX_TTL_SECONDS`                                           | `604800`; the longest an entry is kept                                       |

Without any `CACHE_REDIS_*` setting each process caches in its own memory: right for one node and for development, wrong for several.

- **Keys** are `{prefix}:{build id}:{Next.js key}`, so two releases never serve each other's pages during a rolling update; a new release starts with an empty cache and fills it on first requests.
- **Revalidation** is a time per tag in one hash (`{prefix}:tags`): an entry is fresh only if it was written after each of its tags was last revalidated. Nothing is deleted, so a revalidation is one write, any node can take it, and repeating it is harmless. The CMS calls `/api/revalidate` on any node (through the balancer); the webhook waits for the mark and answers `503` when Redis cannot take it, and the CMS tries again.
- **Lifetime**: an entry stays in Redis for its `expire`, or 24 of its revalidation periods (at least a minute, at most `CACHE_MAX_TTL_SECONDS`): past its revalidation time it is still served while it is rendered again in the background. Configure Redis with `maxmemory` and `allkeys-lru`, and without persistence: it is a cache.
- **Redis down**: reads miss and writes are dropped, without waiting (no offline queue, 500 ms command timeout). Pages are then rendered on every request: slower and harder on the backend, but up. Readiness does not depend on Redis, for the same reason it does not depend on the backend. The webhook answers 503 until Redis is back.
- **Clocks**: nodes compare their write times with other nodes' revalidation times. Keep them in sync (NTP); `CACHE_CLOCK_SKEW_MS` absorbs small differences by treating a page written just after a revalidation as written before it.

The two-node test (`pnpm --filter web test:multinode`, in CI) runs two production servers on one Redis: a page rendered by one is served by the other, and a revalidation sent to one renders anew on both.

## Security headers

Every response carries (`apps/web/src/lib/security/headers.ts`):

- `Content-Security-Policy`: scripts and styles only from the site itself and inline, images only from the site itself and the media CDN (`CMS_MEDIA_URL`, see below), no media from elsewhere, no plugins, no frames, `frame-ancestors 'none'`, `form-action 'self'`, `base-uri 'self'`, `upgrade-insecure-requests`. Inline scripts are allowed instead of nonces: Next.js streams page data in inline scripts, and a nonce would make every page render per request, which the shared cache exists to avoid. No outside text reaches an inline script: React escapes text, and JSON-LD is serialized so it cannot close its tag.
  - The policy is fixed when the image is built, so a media CDN must be named at build time too: `docker build --build-arg CMS_MEDIA_URL=https://media.example.com .`. A server whose `CMS_MEDIA_URL` the build did not name refuses to start, rather than serving pages whose images the browser blocks.
- `Strict-Transport-Security` (one year, subdomains); `HSTS=false` at build time turns it off where some host is not HTTPS.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (no camera, microphone, location, payment, USB), `Cross-Origin-Opener-Policy: same-origin`.

## Graceful shutdown

On SIGTERM readiness turns `503` at once and the process keeps serving for `SHUTDOWN_DRAIN_SECONDS`, then exits ([README](../README.md#health-checks-and-shutdown)). The orchestrator's grace period must be longer (Kubernetes `terminationGracePeriodSeconds`, Compose `stop_grace_period`), and the balancer should retry another node on `502`/`503` (the nginx example does).

## At the edge

Rate limits belong in front of the nodes, where all traffic is seen: the CDN, the cloud balancer, or nginx (`deploy/nginx.conf`: 20 requests a second per address, bursts of 40, `429` beyond). Leave `/api/health/*` and `/api/revalidate` out of the limit; the webhook checks its own signature. Set `TRUST_PROXY_HEADERS=true` only when the edge sets `X-Forwarded-For` and `X-Forwarded-Proto` and strips any a client sends.

## Logs and traces

- **Logs** are JSON lines (`time`, `level`, `msg`, fields) on stdout, warnings and errors on stderr; `LOG_LEVEL` drops lower levels. Next.js's own start-up lines are plain text.
- **Traces**: with `OTEL_EXPORTER_OTLP_ENDPOINT` (or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`) set, each node exports OpenTelemetry traces over OTLP as `OTEL_SERVICE_NAME` (`crypto-blog-web`): requests, renders, and fetches. Calls to the backend and the CMS carry the trace context (`traceparent`), and only those: so the backend's spans and logs join the page's trace, which is how a request is followed across services. The trace header does not change cache keys.
- **Request IDs**: the edge's `X-Request-ID` (the nginx example sets one) is in the access log and, as `http.request_id`, on the request's root span.
