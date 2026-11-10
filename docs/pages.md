# Pages

What each public page shows, where its data comes from, and how it is cached. Every page is under `/{locale}` ([i18n.md](i18n.md)); its metadata, structured data, and sitemaps are in [seo.md](seo.md).

## Coins

The work of [#5](https://github.com/mdastpak/crypto-blog/issues/5). Data comes from the backend's market data catalog through [the client](backend-api.md).

### Top coins: `/{locale}/coins`

- The catalog by market cap rank, 50 a page, with cursor pagination (`?cursor=`) and search (`?q=`: the exact symbol, or part of the name or slug).
- Each row: rank, logo ([Coin logos](#coin-logos)), name and symbol, an **Unverified** badge for coins not listed on the exchange, price and 24h change, circulating supply.
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

## Markets

The work of [#6](https://github.com/mdastpak/crypto-blog/issues/6): the exchange's own markets, priced from the market data catalog. The backend has no public list of pairs or prices of its own, so a market is a listed currency (`GET /public/currencies`) against each quote of `MARKET_QUOTES` (default `USDT,IRT`) that the release may show; a fiat currency is only a quote. Its price comes from the catalog asset with the same symbol, the one linked to the exchange (verified) first.

### All markets: `/{locale}/markets`

- Each row: logo, pair, the currency's name in the page's language, the median price in the pair's quote, the median 24h change, and how many venues it is the median of. A currency with no catalog asset or no fresh price shows dashes; a backend outage shows a notice instead of the table.
- One catalog lookup per currency (its venues price every quote of it), at most 8 at a time, each cached for 30 s.
- Rendered on its first request, then refreshed in the background at most every minute.

### A market: `/{locale}/markets/{base}-{quote}`

- The path is lower case (`btc-usdt`); anything else, an unknown or fiat base, or a quote the release does not show (IRT abroad) answers 404.
- Header: logo, pair, the currency's name, and a **Trade** button (`EXCHANGE_APP_URL/trade/{BASE}?quote={QUOTE}`) when `EXCHANGE_APP_URL` is set.
- **Median price in the quote**: the median of the venues of that quote that are neither stale nor outliers, with the median 24h change, the number of venues, and the time of the latest.
- **Prices on exchanges**: every venue of that quote the release may show, by volume, with its difference from the median and **Stale** / **Outlier** badges; a note says those are listed but not counted.
- Links to the base's other markets and its coin page.
- Rendered on its first request, then refreshed at most every 30 s.

In an `international` release the IRT markets do not exist and Iranian venues are hidden, as on coin pages ([Region](#region)).

## Editorial content

The work of [#8](https://github.com/mdastpak/crypto-blog/issues/8). Articles and campaigns come from the CMS ([cms.md](cms.md)) over its REST API, `CMS_API_URL`. Without it the release has no blog or campaign pages (404) and no links to them.

### The blog: `/{locale}/blog`

- Articles newest first, 12 a page (`?page=`), with a filter by type (`?type=article|guide|analysis|news`). Each card: cover, type, date, title, excerpt, author.
- Filtered and later pages are `noindex, follow`.
- `/{locale}/blog/categories/{slug}`, `/{locale}/blog/tags/{slug}`, and `/{locale}/blog/authors/{slug}` list the articles of a category, a tag, or an author.
- Rendered per request (they depend on the query); the CMS answers they read are cached.

### An article: `/{locale}/blog/{slug}`

- Type, date, title, excerpt, author, cover, the body, its updates and corrections (newest first, with their time), its sources with their headlines (links `nofollow`), categories and tags. News drafted by the news worker also shows an editorial note, and an "Automated" label when it was published without review ([news.md](news.md#editorial-workflow)).
- **Coins in this article**: live cards of the coins it is about (catalog slugs, at most 6), with the price as of the page's last refresh. A coin the catalog does not know is left out.
- `hreflang` links to each served locale the article is translated into, and a canonical link.
- Rendered on its first request, then cached; publishing revalidates it at once, and it refreshes at most every 5 minutes anyway.

### Campaigns: `/{locale}/campaigns`, `/{locale}/campaigns/{slug}`

- Each campaign shows **Upcoming**, **Running**, or **Ended**, and its dates. An ended campaign stays readable, with a note and without its call to action, so its terms stay on record.
- The call to action is a link (https or a path of the site); terms are shown in their own box.
- A campaign page refreshes at most every minute, so its state is at most a minute old.

### Related articles on coin pages

A coin page lists the three latest articles about the coin. If the CMS cannot answer, the section is left out; the coin page never fails because of it.

### Translations

The CMS returns every translation of a document (`locale=all`), so one cached answer serves every language, and the blog applies these rules (`lib/cms/localize.ts`):

- A **list** shows only documents whose title is translated into the page's language, so a list never mixes languages.
- A **document** not translated into the page's language is shown in the first served language it has. It is marked with its language and direction (`lang`, `dir`), carries a note, is `noindex`, and its canonical link points to the original.
- Within a translated document, a **field** not translated yet (often the body, while a translator works) falls back the same way, field by field, marked and noted.
- Only languages the release serves are fallbacks: an English-only international release never shows Persian text.
- The blog's own labels (dates, "By", headings) stay in the page's language.

### Where a document appears

A document limited to some regions or sites appears only there. The region is `DEPLOYMENT_REGION`; the site is `SITE_ID`, the country site this deployment serves. Without `SITE_ID`, site limits are not applied, so a deployment that serves several country sites with different content runs as one deployment per site.

### Rich text

The body is rendered from the CMS's Lexical JSON into plain elements: paragraphs, headings (from `h2`, below the title), lists, quotes, links, images, rules, and text formats. There is no raw HTML, so the CMS cannot inject markup or script, and links keep to http(s), mailto, and paths of this site; external links are `nofollow`.

### Media

The CMS is internal, so images reach visitors through `/cms-media/{file}` on this app, which passes only plain file names and image types and lets browsers and CDNs cache them for a day. With `CMS_MEDIA_URL` set (a CDN in front of the media bucket), pages link there instead.

### Publishing and preview

- `POST /api/revalidate` takes the CMS's signed publish webhook and expires the tags it names (`cms:*` only) at once ([cms.md](cms.md#publishing-and-the-blogs-cache)). Off without `REVALIDATE_SECRET`.
- `GET /api/preview` opens a draft from the admin panel's **Preview** link. The link is signed with `REVALIDATE_SECRET` for one document and locale and expires after an hour. It turns on draft mode (a cookie of that browser only); pages then read the latest draft with `CMS_PREVIEW_API_KEY`, are never cached, are `noindex`, and show a banner with **Exit preview** (`/api/preview/exit`).

## Errors

A page that fails to render, with nothing cached, shows a localized error with a **Try again** button. Unknown paths show the localized 404.

## Coin logos

The market-data sources give each asset a logo on their own image hosts, and an admin may set a currency's logo to any https URL. Browsers never fetch those hosts ([#31](https://github.com/mdastpak/crypto-blog/issues/31)): that would send every visitor's address to a third party, and the hosts are often unreachable from Iran. Pages link to `/coin-logo?u=<source URL>` on this app instead, which:

- fetches only https URLs on a host in `COIN_LOGO_HOSTS` (default: `assets.coingecko.com`, `coin-images.coingecko.com`, `s2.coinmarketcap.com`), with no cookies, no referrer, and no redirects;
- accepts PNG, JPEG, WebP, GIF, and AVIF of at most 512 KB, never SVG, and serves them with `nosniff` and a sandboxing policy;
- keeps each logo in the shared cache for a week; while a refresh fails, the stored copy is served, so logos load while their source is down. Browsers and CDNs cache the answer for a day.

A logo that is not https is dropped when the backend's answer is read; one on a host outside `COIN_LOGO_HOSTS` is shown as the coin's first letter, as is a coin with no logo. Structured data links to the logo on this site too. Add a host to `COIN_LOGO_HOSTS` when the backend's logos move, for example to the exchange's own media host.
