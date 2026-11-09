# Operations runbook

What to check and do when the blog misbehaves in production. How it is deployed: [deployment.md](deployment.md).

## Health at a glance

| Check                                | Healthy                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| `GET /api/health/ready` on each node | `200`; `503 draining` only during a rollout                |
| `redis-cli info stats`               | `keyspace_hits` growing much faster than `keyspace_misses` |
| `redis-cli info memory`              | `used_memory` under `maxmemory`; evictions are fine        |
| Web logs, `level` `warn` or `error`  | rare; see below                                            |
| CMS logs, revalidation               | no repeated failures to call `/api/revalidate`             |

## Pages are slow, the backend sees much more traffic

The shared cache is probably not answering. Look for `cache redis unavailable` in the web logs (one line per outage) and check Redis itself: `redis-cli -h … ping`, Sentinel `SENTINEL get-master-addr-by-name <master>`.

- While Redis is down every page is rendered per request. Pages still work; scale web nodes up if the backend can take it, and fix Redis.
- After Redis returns (`cache redis back`), the cache fills again on first requests; no action needed.
- If Redis is up but hits are low: are nodes on different releases (each build has its own keys, expected during a rollout)? Is `CACHE_KEY_PREFIX` the same on all nodes of one deployment?

## An edited article does not show

1. The CMS logs whether it called the webhook and the answer.
2. `401`: `REVALIDATE_SECRET` differs between the CMS and the web nodes, or the clocks differ by more than five minutes.
3. `503 cache_unavailable`: Redis did not take the mark; the CMS retries three times. After Redis is back, save the document again in the CMS (or call the webhook by hand, signed) to revalidate it.
4. `200` but an old page: check the nodes' clocks (NTP). A node whose clock is ahead writes pages that look newer than the revalidation.
5. To clear everything at once, roll out a new build (new keys), or delete the deployment's keys: `redis-cli --scan --pattern '<prefix>:*' | xargs -r redis-cli del` (Cluster: per node). Pages are rendered again on first request.

## Rollout

- Roll nodes one at a time (`maxUnavailable: 0`); readiness drains each before it stops.
- The new release starts with an empty cache: expect more backend traffic for a few minutes. Roll out off-peak when the backend is near its limits.
- Run the CMS's and the news worker's migrations before their new release (the `cms-migrate` image, `src/migrate.ts`).
- Roll back by deploying the previous image: its cache keys may still be in Redis and are served at once.

## A node misbehaves

- `503 invalid_config` on readiness: the node's environment is wrong; it lists every problem at start-up in its log.
- Restart a single node freely: it holds no state, and its catalog copy reloads from the feed within a minute.

## Redis maintenance

- Sentinel failover: the nodes follow the new master; expect a few seconds of cache misses.
- Flushing Redis is safe at any time: it only costs re-rendering.
- Size: about the HTML and data of every page visited within its lifetime. Start at 512 MB with `allkeys-lru` and watch evictions.

## Too much traffic from one place

Rate limits live at the edge ([deployment.md](deployment.md#at-the-edge)). Lower the limit there or block the address range; the web nodes do not limit by themselves.
