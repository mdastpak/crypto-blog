# Backend API client

The work of [#4](https://github.com/mdastpak/crypto-blog/issues/4). Pages never call `fetch` on the backend themselves; they use `apps/web/src/lib/backend` (server only).

```ts
import { marketData, isNotFound } from "@/lib/backend";

const asset = await marketData.getAsset(slug).catch((error) => {
  if (isNotFound(error)) notFound();
  throw error;
});
```

## Routes

| Function                                                            | Route                                    | Cached for | Tags                   |
| ------------------------------------------------------------------- | ---------------------------------------- | ---------- | ---------------------- |
| `marketData.listAssets({ q, sort, limit, cursor })`                 | `GET /market-data/assets`                | 5 min      | `assets`               |
| `marketData.getAsset(slug)`                                         | `GET /market-data/assets/{slug}`         | 5 min      | `asset:{slug}`         |
| `marketData.getVenues(slug)`                                        | `GET /market-data/assets/{slug}/venues`  | 30 s       | `asset:{slug}:venues`  |
| `marketData.getCandles(slug, { venue, quote, interval, from, to })` | `GET /market-data/assets/{slug}/candles` | 60 s       | `asset:{slug}:candles` |
| `marketData.feed({ updatedSince, limit, cursor })`                  | `GET /market-data/feed/assets`           | never      | —                      |
| `publicApi.listCurrencies({ q, sort, limit, cursor })`              | `GET /public/currencies`                 | 5 min      | `currencies`           |
| `publicApi.getLocales()`                                            | `GET /public/locales`                    | 1 h        | `locales`              |
| `publicApi.getStatus()`                                             | `GET /public/status`                     | 30 s       | `status`               |

"Cached for" is Next.js's data cache (`next.revalidate`): after that the next request still gets the cached answer while a fresh one is fetched in the background. Tags let a change to one asset revalidate only its pages (`revalidateTag`), which the revalidation webhook and the feed follower use (#8, #10). `paginate()` walks a cursor-paginated list.

## Responses

- The envelope `{ status, message, code, request_id, info }` is unwrapped; `info` is validated with a zod schema (`schemas.ts`).
- Unknown fields are dropped, so the backend can add fields freely. A missing or mistyped field we rely on fails at the boundary with `invalid_response`, not deep inside a page.
- Decimal amounts (prices, supplies, volumes) stay strings, as the backend sends them, so no precision is lost; they are converted only for display.

## Failures

Every failure is a `BackendError` with:

- `code`: the backend's stable code (`not_found`, `rate_limited`, `database_busy`, …), or ours for failures before an answer: `timeout`, `network_error`, `circuit_open`, `invalid_response`;
- `status` (`0` when there was no answer), `requestId` (quote it to find the request in the backend's log), `retryAfterSeconds`.

Only GETs are sent, so failures that may pass are retried: network errors, timeouts, `429`, `502`, `503`, `504`, at most twice, with jittered backoff (≈100 ms, ≈200 ms) or the server's `Retry-After` up to 2 s. Each request has a timeout of `BACKEND_TIMEOUT_MS`.

A **circuit breaker** per process opens after 5 failures in a row (5xx, timeouts, network errors; never a 4xx) and fails calls at once for 10 s, so a down backend does not hold every render for the whole timeout. Then one call is let through, and its success closes the circuit. Pages already cached keep being served meanwhile.

## The contract with the backend

`apps/web/contracts/backend-openapi.json` is a snapshot of the routes above and their definitions, taken from the backend's OpenAPI document. `contract.test.ts` checks that every field our schemas read exists there with a compatible type. When the backend changes, refresh the snapshot and run the tests:

```sh
node apps/web/scripts/sync-backend-contract.mjs ../Crypto-Exchange/docs/swagger.json
pnpm test
```

The script fails if a route we use is gone. Tests use recorded fixtures (`src/lib/backend/fixtures`); no test calls the network.
