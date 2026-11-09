# Country sites, GeoIP, and the release region

The work of [#3](https://github.com/mdastpak/crypto-blog/issues/3). The backend owns the rules ([Crypto-Exchange docs/i18n.md, "Sites and redirects"](https://github.com/mdastpak/Crypto-Exchange/blob/main/docs/i18n.md#sites-and-redirects)); the blog asks it and follows its answer.

## The first page view of a visit

`apps/web/src/proxy.ts` runs before every page. On the first page view of a visit, that is without the `site_checked` cookie, it calls `GET /api/v1/public/site?path=<page>` and:

- when the answer says to redirect, sends the visitor there with `302`, so a visitor from Iran on the global site lands on the Iranian one, in the same page;
- otherwise serves the page, and uses the answer's locale for a path without one.

It then sets `site_checked`, a session cookie, so the rest of the visit makes no call. The backend's rules apply, in its order: a site that `enforce`s its countries (legal), crawlers stay, the visitor's choice (`site` cookie), a chosen locale the current site offers, the site of the visitor's country (GeoIP), the default site. An explicit choice beats GeoIP, because GeoIP is wrong for travellers and VPN users.

The blog skips the call for crawlers, which index each site through its `hreflang` links (#9), and when `SITE_DETECTION=false`.

### What is sent to the backend

Only what the decision needs:

| Header                          | Value                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Origin`                        | the site the visitor is on: `https://` + `Host`, or `X-Forwarded-Proto`/`X-Forwarded-Host` behind a trusted proxy |
| `Cookie`                        | only `site` and `locale`; never the visitor's other cookies                                                       |
| `Accept-Language`, `User-Agent` | as received                                                                                                       |
| `X-Locale`                      | the locale in the path, if any: a localized link is a choice, and the visitor stays when the site offers it       |
| `X-Forwarded-For`               | as received, only with `TRUST_PROXY_HEADERS=true`                                                                 |

Set `TRUST_PROXY_HEADERS=true` only when every request reaches the web nodes through a load balancer that sets these headers, and add the web nodes to the backend's `server.trusted_proxies`, so that the backend takes the visitor's address from them. Otherwise anyone could pick their country by sending the header.

### Safety

- The backend refuses open redirects. The blog checks again: it follows a redirect only to an `http(s)` URL, without credentials, whose host is the domain of a site in the answer. Anything else is ignored and the page is served.
- Redirects carry `Cache-Control: private, no-store`; the locale redirect also `Vary: Accept-Language, Cookie`.

### When the backend cannot answer

The page is served on the host the visitor asked for, in its negotiated locale, and a warning is logged. The call has its own short timeout (`SITE_TIMEOUT_MS`, 800 ms), no retries, and its own circuit breaker (5 failures, 30 s), so a backend outage costs a visitor at most one short wait. `site_checked` is set anyway, so a down backend is not asked again during the visit.

### Behind a CDN

Pages are cached and the same for everyone, so a CDN may serve them. But the site check runs on the web nodes: a CDN must send requests without the `site_checked` cookie to the origin (or run the same check at the edge), or first-time visitors would never be redirected.

### Locale from another site

Cookies of one domain are not sent to another, so the backend carries a locale that is not the target site's default in the URL as `?lang=`. The blog takes `lang` first when choosing the locale of a path without one, and drops it from the URL.

## The release region

`DEPLOYMENT_REGION` (`ir` or `international`, the same value as the backend) decides what a release may show. Pages ask `apps/web/src/lib/region.ts`, never the raw string:

|                                              | `ir`      | `international` |
| -------------------------------------------- | --------- | --------------- |
| Iranian venues (`region: ir` quotes)         | shown     | hidden          |
| Prices in IRT / IRR                          | shown     | hidden          |
| Iranian payment gateways and identity checks | mentioned | never           |

The backend refuses Iran-only features in an international release (#272), and an international release lists no Iranian site, so the two agree when both are set to the same region.

## Settings

| Variable              | Default | Meaning                                                                                 |
| --------------------- | ------- | --------------------------------------------------------------------------------------- |
| `SITE_DETECTION`      | `true`  | Ask the backend for the visitor's site on the first page view of a visit                |
| `SITE_TIMEOUT_MS`     | `800`   | Timeout of that call                                                                    |
| `TRUST_PROXY_HEADERS` | `false` | Trust `X-Forwarded-For`, `-Host`, `-Proto` (only behind a load balancer that sets them) |
| `DEPLOYMENT_REGION`   | `ir`    | `ir` or `international`                                                                 |
