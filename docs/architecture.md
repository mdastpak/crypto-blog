# Architecture

```
            visitors, crawlers
                   │
            load balancer / CDN
                   │
     ┌─────────────┴─────────────┐
     │  web (Next.js), N nodes   │  apps/web
     └──────┬──────────────┬─────┘
            │              │
  exchange backend    Payload CMS        admin panel on an internal domain only
  (Crypto-Exchange)   apps/cms (#7)
     │                     │
  PostgreSQL, Redis    PostgreSQL, S3-compatible media
```

## The pieces

- **web** (`apps/web`) renders every public page on the server (SSR and ISR) so crawlers get complete HTML. It is stateless: any node can answer any request, and shared state goes to the backend, the CMS, or a shared cache (#10).
- **Exchange backend** ([Crypto-Exchange](https://github.com/mdastpak/Crypto-Exchange)) is the source of live data: the market data catalog (`/api/v1/market-data/*`, and the feed `/market-data/feed/assets` for keeping a copy of the catalog), the listed currencies, the locales, and the country sites with their GeoIP decision and redirects. The web app never decides a redirect or a locale on its own when the backend has an answer (#3).
- **Payload CMS** (`apps/cms`, #7) holds articles, news, guides, and campaigns in every language. Its admin panel is deployed separately and never served on the public domains. Publishing calls a signed revalidation webhook on the web app (#8).

## Pages

| Page                                     | Data                                 | Issue |
| ---------------------------------------- | ------------------------------------ | ----- |
| Coin detail, top coins, newest coins     | market data catalog                  | #5    |
| Markets and pairs                        | listed currencies, tickers per venue | #6    |
| Articles, categories, authors, campaigns | CMS                                  | #8    |
| Sitemaps, robots, JSON-LD                | feed, CMS                            | #9    |

## Languages, direction, theme, and region

Routes carry the locale (`/fa/...`, `/en/...`); `lang` and `dir` follow it, and the theme is `light`, `dark`, or `system` ([i18n.md](i18n.md)). The release region (`DEPLOYMENT_REGION`, the same value as the backend) hides Iran-only content, such as IRT prices and Iranian venues, in an `international` release (#3).

## Health and shutdown

See [Health checks and shutdown](../README.md#health-checks-and-shutdown) in the README.
