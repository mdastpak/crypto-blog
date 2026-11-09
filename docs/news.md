# News collection

The work of [#14](https://github.com/mdastpak/crypto-blog/issues/14). `apps/news-worker` is a background worker that collects crypto news from many sources into a PostgreSQL store. Editors and the news drafting of [#15](https://github.com/mdastpak/crypto-blog/issues/15) read from it. It publishes nothing itself.

## Run it locally

```sh
createuser -P news && createdb -O news news
cp apps/news-worker/.env.example apps/news-worker/.env          # set DATABASE_URL, NEWS_BOT_INFO_URL
cp apps/news-worker/sources.example.json apps/news-worker/sources.json   # list real sources
pnpm --filter news-worker migrate
pnpm dev:news                                                     # health on http://localhost:3002/health/ready
```

## Sources

Sources are listed in a JSON file (`NEWS_SOURCES_FILE`, `sources.example.json`), reviewed like code. At start-up every node syncs the file into the `news_sources` table. A source removed from the file is disabled, not deleted, so its items keep their attribution.

| Field              | Meaning                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`               | A stable id: lowercase letters, digits, dashes                                                                                                                           |
| `name`, `homepage` | Shown as the attribution of its items                                                                                                                                    |
| `kind`             | `rss` (RSS 2.0, RSS 1.0, and Atom). A JSON news API is another provider behind the same interface (`src/providers.ts`)                                                   |
| `url`              | The feed                                                                                                                                                                 |
| `language`         | `fa` or `en`, the default when an item's own text does not say                                                                                                           |
| `region`           | `ir` or `global`. Iranian sources are collected only by an `ir` release (`DEPLOYMENT_REGION`)                                                                            |
| `license`          | `headline` (the default) keeps the title, a summary of at most 300 characters, the link, and metadata. `full` also keeps the text, only for sources whose terms allow it |
| `intervalMinutes`  | How often to poll, default 15                                                                                                                                            |
| `enabled`          | Default true                                                                                                                                                             |

## Being a good citizen

- **User-Agent**: `CryptoBlogNewsBot/0.1 (+NEWS_BOT_INFO_URL)`, so a source's owner can see who we are and reach us.
- **robots.txt** is honored per host, matched for our product token or `*`, and cached a day. A host whose robots.txt answers 5xx or cannot be reached is not fetched for 15 minutes.
- **Conditional requests**: the `ETag` and `Last-Modified` of each feed are kept and sent back, so an unchanged feed costs a `304`.
- **Rate limits**: at least `HOST_MIN_INTERVAL_MS` (2 s) between two requests to one host from a node. A `429` or `503` with `Retry-After` is waited out. A failing source backs off, its interval doubled per failure in a row up to 6 hours.
- **Limits**: a 15 s timeout and a 5 MB body limit per fetch, and at most 200 entries per feed.
- **Attribution**: the original link and the source are always kept, and the original link is what any page shows.

## What an item holds

| Step          | Rule                                                                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Link          | The entry's link (or a URL guid), resolved against the feed                                                                                                                   |
| Canonical URL | https or http as given, host in lowercase without `www.`, no fragment, no tracking parameters (`utm_*`, `fbclid`, `gclid`, …), the other parameters sorted, no trailing slash |
| Text          | Tags, scripts, and styles removed, entities decoded, spaces collapsed. Persian text uses the Persian `ی` and `ک`                                                              |
| Language      | Persian when most letters are in the Arabic script, English otherwise, the source's language for very short text                                                              |
| Published     | The entry's time in UTC. Missing or unreadable: the time it was fetched. More than an hour in the future: now                                                                 |
| Image         | The enclosure, `media:content`, or `media:thumbnail` image                                                                                                                    |
| Coins         | Catalog coins it mentions (below)                                                                                                                                             |

## Coins

The worker loads the market data catalog's top 1,000 assets from `BACKEND_API_URL` every 6 hours (without it, items get no coins) and matches with rules against false hits:

- A **name** matches as a whole word in any case ("bitcoin", "Ethereum"). A name that is an everyday word ("Gas", "Sun") matches only next to its symbol in capitals.
- A **symbol** matches only in capitals, as a whole word of at least three letters, and not when it is an acronym of news (`SEC`, `ETF`, `CEO`, `USD`, …), unless it is written `$SYMBOL`.
- A symbol several coins share matches only the coin whose name is also present.
- Persian names of the top coins (بیت‌کوین, اتریوم, تتر, …) match in Persian text, with or without the half-space.

## Duplicates and stories

- **Exact duplicates** are skipped: the same canonical URL, or the same normalized title and summary under another URL.
- **Stories**: an item joins the most similar story of the last `CLUSTER_WINDOW_HOURS` (48) in its language when their titles' word sets are at least 60% alike (Dice coefficient, without stop words). Otherwise it starts a new story. One story reported by ten sources is one cluster with ten items, and the coins of all of them.

## Store

| Table           | Holds                                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `news_sources`  | The sources and their fetch state: validators, next fetch, lease, failures, last error                                                                               |
| `news_items`    | One row per article: source, story, canonical and original URL, title, summary, text (with a `full` license), image, author, language, region, published time, coins |
| `news_clusters` | One row per story: title, language, coins, item count, first and last seen                                                                                           |

Schema changes are SQL files in `src/migrations`, applied once per release by `pnpm --filter news-worker migrate` (or the image with `node --import tsx src/migrate.ts`) under an advisory lock. The worker refuses to start while a migration is pending.

## Several nodes

- **Leases**: a source row is also its fetch job. A worker leases due sources with `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`, so any number of workers claim at once without fetching a source twice or waiting on each other. A lease lasts `LEASE_SECONDS` (120). A worker that dies leaves leases that expire and are taken by another, and its late writes are ignored.
- **Stories** are formed under a per-language transaction lock, so two workers saving one story at once make one cluster.
- **Egress** is per node: direct, or through `NEWS_HTTP_PROXY` (an http(s) proxy, or the local end of a VPN), like the backend's market worker. Iranian and international nodes can use different routes.
- The per-host interval is per node. With several nodes, a host gets at most one request per interval per node. Keep the number of nodes small, or raise the interval.
- **Shutdown**: on `SIGTERM` a worker stops claiming, finishes the sources in hand, and releases its leases. Readiness answers `503` meanwhile.

## Health and metrics

- `GET /health/live`: the process is up.
- `GET /health/ready`: `503` while PostgreSQL does not answer or the worker is stopping.
- `GET /metrics` (Prometheus): `news_fetches_total{source,result}` (`ok`, `not_modified`, `blocked`, `error`) and `news_items_total{source,outcome}` (`new_story`, `joined_story`, `duplicate`, `invalid`).

The admin panel's view of sources and stories comes with the drafting of #15.

## Settings

| Variable               | Default        | Meaning                                                                    |
| ---------------------- | -------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`         |                | The news store                                                             |
| `DEPLOYMENT_REGION`    | `ir`           | `ir` collects Iranian and global sources, `international` only global ones |
| `NEWS_SOURCES_FILE`    | `sources.json` | The sources                                                                |
| `NEWS_BOT_INFO_URL`    |                | A page about the bot, named in the User-Agent                              |
| `BACKEND_API_URL`      |                | The market data catalog, for coins                                         |
| `NEWS_HTTP_PROXY`      |                | This node's egress proxy                                                   |
| `CONCURRENCY`          | 4              | Sources fetched at once per node                                           |
| `POLL_SECONDS`         | 10             | How often to look for due sources                                          |
| `LEASE_SECONDS`        | 120            | How long a lease lasts                                                     |
| `HOST_MIN_INTERVAL_MS` | 2000           | Minimum time between requests to one host, per node                        |
| `FETCH_TIMEOUT_MS`     | 15000          | Timeout of one fetch                                                       |
| `MAX_FEED_BYTES`       | 5000000        | Largest feed read                                                          |
| `CLUSTER_WINDOW_HOURS` | 48             | How far back a story can be joined                                         |
| `PORT`                 | 3002           | Health and metrics                                                         |
| `WORKER_ID`            | host and pid   | The lease owner's name                                                     |

Every invalid value is reported at once at start-up, and the worker exits.

## Tests

`pnpm --filter news-worker test` runs the unit tests (feeds, normalization, coins, stories, robots.txt, the polite HTTP client, settings) on recorded feeds in `src/fixtures`, with no network. With `TEST_DATABASE_URL` set to an empty database, integration tests run against PostgreSQL: migrations run once from two jobs, source sync, leases shared by two workers and taken back after a crash, regions, deduplication, one story from two workers at once, a whole fetch then a `304`, and backoff. CI runs both.
