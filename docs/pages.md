# Pages

What each public page shows, where its data comes from, and how it is cached. Every page is under `/{locale}` ([i18n.md](i18n.md)).

## Coins

The work of [#5](https://github.com/mdastpak/crypto-blog/issues/5). Data comes from the backend's market data catalog through [the client](backend-api.md).

### Top coins: `/{locale}/coins`

- The catalog by market cap rank, 50 a page, with cursor pagination (`?cursor=`) and search (`?q=`: the exact symbol, or part of the name or slug).
- Each row: rank, logo, name and symbol, an **Unverified** badge for coins not listed on the exchange, price and 24h change, circulating supply.
- The list has no prices, so each row's price comes from its venues: at most 8 calls at a time, each cached for 30 s. A row whose venues fail shows a dash; a backend outage shows a notice instead of the table.
- Search results and later pages are `noindex, follow`; the first page is indexed.
- Rendered per request (it depends on the query); the backend answers it reads are cached.

### A coin: `/{locale}/coins/{slug}`

- Header: logo, name, symbol, rank, **Listed** or **Unverified**, and a **Trade** button for listed coins when `EXCHANGE_APP_URL` is set.
- An unverified coin carries a note that it is not listed and its data is from public sources, unverified.
- **Price**: the median last price of the venues that are neither stale nor outliers, in the first of USDT, USD, USDC that has any, with the median 24h change and how many venues it is the median of. Stale and outlier prices are listed but never counted.
- **Chart**: daily closes from the most traded usable venue, drawn as server-rendered SVG (no JavaScript, readable by crawlers), its range written out for screen readers. Time runs left to right in every locale.
- **Prices on exchanges**: every venue the release may show, by volume, with its difference from the median and stale/outlier badges.
- About (the catalog's plain-text description), supply, links (https only, `nofollow`), contracts per network, and the source attribution its license asks for.
- An unknown or hidden coin answers 404. Prices and the chart are optional: without them the page still renders.
- Rendered on its first request, then served from the cache and refreshed in the background at most every 30 s. If the backend is down during a refresh, the last good page keeps being served.

### Region

In an `international` release, Iranian venues and IRT/IRR quotes are hidden from every table and never counted in a price ([sites.md](sites.md#the-release-region)).

### Newest coins

Waits on the backend's sort by first-seen time (Crypto-Exchange [#304](https://github.com/mdastpak/Crypto-Exchange/issues/304)); tracked in [#20](https://github.com/mdastpak/crypto-blog/issues/20).

## Errors

A page that fails to render, with nothing cached, shows a localized error with a **Try again** button. Unknown paths show the localized 404.
