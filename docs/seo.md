# Search engines

How the blog tells crawlers what it has, in which languages, and what each page is. The work of [#9](https://github.com/mdastpak/crypto-blog/issues/9).

## Metadata on every page

Pages build their metadata with `pageMetadata` (`apps/web/src/lib/seo/metadata.ts`):

- **Canonical URL** on this site's `PUBLIC_SITE_URL`, in the page's locale. A list with a search query or a cursor is `noindex, follow`, and so is an article shown in a fallback language ([pages.md](pages.md#translations)).
- **hreflang links** (`lib/seo/alternates.ts`) for every locale the page exists in, on every country site the backend lists (`GET /public/site`, cached for an hour). A site with countries is named per country (`fa-IR`, `en-IR`); a site without countries gets the plain language (`en`). `x-default` points to the site without countries, in its default locale. With no country sites, the links point to this site in each locale. An article links only the languages it is translated into.
- **Open Graph and Twitter cards**: site name, title, description, `article` type with dates for articles. A coin page's image is `/og/coins/{slug}`, a 1200×630 PNG drawn on the brand's dark palette (Latin text only, since the image font has no Persian). Articles use their hero image.

## Structured data

JSON-LD (`lib/seo/jsonld.ts`, rendered by `components/seo/JsonLd.tsx`) is escaped so that no text can close its script tag.

| Page           | Types                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Home           | `Organization`, `WebSite`                                                                                                                      |
| Every page     | `BreadcrumbList`, from the visible breadcrumbs (`components/seo/PageBreadcrumbs.tsx`)                                                          |
| A coin         | the catalog's own schema.org `Thing` from the feed (`structured_data`), with the page URL; a plain `Thing` while the copy does not have it yet |
| Articles, news | `Article` or `NewsArticle`, with `citation` for each source; generated news names the publisher, not a person, as author                       |

## Sitemaps

`/sitemap.xml` is an index of files under `/sitemaps/`, one per kind and locale:

| File                                              | Content                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `pages-{locale}.xml`                              | home, lists                                                               |
| `markets-{locale}.xml`                            | every market of the listed currencies                                     |
| `coins-{locale}-{n}.xml`                          | catalog coins, 10,000 a file, from this node's copy of the feed           |
| `articles-{locale}.xml`, `campaigns-{locale}.xml` | published CMS documents in that locale, with `lastmod` and hreflang links |
| `news.xml`                                        | Google News sitemap: news from the last 48 hours, at most 1,000           |

Sitemaps are built per request and cached by shared caches for 15 minutes (5 for news). `robots.txt` allows everything but `/api/` and the design page, and names the index and the host.

## The catalog copy and removed coins

Each web node follows the backend's feed (`GET /market-data/feed/assets`) in the background (`lib/seo/catalog.ts`): the first sync reads the whole catalog, later ones, every five minutes, ask with the kept cursor for what changed. Nodes keep their own copies; the feed makes them converge, so there is no shared state and a node that starts late catches up on its own.

A coin the feed marks `removed` leaves the sitemap, and its page answers **410 Gone** from the proxy with a small localized page, so search engines drop it for good. A node that has not synced yet answers as the backend does (404 for an unknown coin).

## Not done

- **Renamed coins**: a 301 from an old slug needs the backend to publish old slugs in the feed. Until then an old slug is a 404.
