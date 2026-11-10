# CMS

The work of [#7](https://github.com/mdastpak/crypto-blog/issues/7). Editorial content (articles, guides, analysis, news, campaigns) lives in a headless [Payload](https://payloadcms.com) CMS in `apps/cms`, a Next.js app of its own with its own deployment and database. The blog reads it over its REST API (#8).

## Run it locally

```sh
# PostgreSQL with a database and role of its own
createuser -P cms && createdb -O cms cms
cp apps/cms/.env.example apps/cms/.env    # set DATABASE_URL, PAYLOAD_SECRET (32+ chars), CMS_PUBLIC_URL
pnpm --filter cms migrate                 # create the schema
pnpm --filter cms seed                    # sample fa/en content; admin@example.com / change-me-please
pnpm dev:cms                              # http://localhost:3001/admin
```

## Content

| Collection           | What                                                                                                                                                                                                  | Localized                 | Drafts                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------ |
| `articles`           | Articles, guides, analysis, news (`type`) with excerpt, cover, rich text body, the coins they are about (catalog slugs), sources, author, categories, tags, sites, regions, SEO fields, `publishedAt` | title, excerpt, body, SEO | yes, with autosave, versions, and scheduled publishing |
| `campaigns`          | Campaigns with summary, cover, body, start and end, call to action, terms, coins, sites, regions                                                                                                      | yes                       | yes, scheduled publishing                              |
| `categories`, `tags` | Taxonomies                                                                                                                                                                                            | name, description         | no                                                     |
| `authors`            | Bylines: name, bio, avatar, linked user                                                                                                                                                               | name, bio                 | no                                                     |
| `media`              | Images, with `thumbnail`, `card`, `hero`, and `og` sizes and a focal point                                                                                                                            | alt text                  | no                                                     |
| `users`              | Staff accounts with roles                                                                                                                                                                             | —                         | —                                                      |

- Locales are `fa` (default) and `en`; a missing translation falls back to Persian. Slugs are shared by every locale.
- `sites` (site ids such as `ir`, `global`) and `regions` (`ir`, `international`) limit where a document appears; empty means everywhere.
- Rich text uses Lexical. Coins are referenced by catalog slug, and the blog renders them live.

## Roles

| Role       | Writes              | Publishes | Deletes | Manages users |
| ---------- | ------------------- | --------- | ------- | ------------- |
| `admin`    | everything          | yes       | yes     | yes           |
| `editor`   | everything          | yes       | yes     | no            |
| `reviewer` | (only to publish)   | yes       | no      | no            |
| `author`   | their own documents | no        | no      | no            |
| `newsbot`  | its own news        | labeled   | no      | no            |

Only accounts whose roles are `viewer` or `newsbot`, and nothing else, may have an API key: a key skips the sign-in proxy, so a person's key would be a password without a second factor. Saving any other account with a key is refused, and the migration of [#30](https://github.com/mdastpak/crypto-blog/issues/30) removed the keys such accounts had.

The `viewer` role is for the blog's preview: create one account with it, turn on its API key, and give the key to the web app as `CMS_PREVIEW_API_KEY`. A leaked key reads drafts but cannot change anything. Article slugs `categories`, `tags`, and `authors` are taken by blog pages and refused.

The `newsbot` role is the news worker's ([news.md](news.md#editorial-workflow)): create one account with it, turn on its API key, and give the key to the worker as `CMS_API_KEY` (the seed creates one for development). It writes only `news` articles, edits only its own, and publishes only an article it labels `autoPublished`; only it and admins set `externalId`, `generatedBy`, and `autoPublished`. Articles also keep `corrections` (time, update or correction, a localized note), shown on the page.

An author's attempt to publish is refused with `403`, so their work waits for review. Only admins change roles, so nobody raises their own. Visitors (no sign-in) read only published documents. Sign-in locks an account for 10 minutes after 10 failures; staff sign in through the sign-in proxy ([Staff sign-in](#staff-sign-in)), so the lock only slows guessing, and a short one keeps anyone who knows an email from locking its owner out for long.

## Publishing and the blog's cache

When a published document changes (or is unpublished or deleted), the CMS posts its cache tags, such as `cms:articles` and `cms:articles:what-is-bitcoin`, to every URL in `WEB_REVALIDATE_URLS`, signed with `REVALIDATE_SECRET`:

```
POST /api/revalidate
X-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">
{"tags":["cms:articles","cms:articles:what-is-bitcoin"]}
```

The web app refuses a wrong signature and one older than 5 minutes (no replay). A draft save sends nothing. Each URL gets up to three tries; a missed call only delays the change until the web app's own cache lifetime for CMS content ends. List one URL per web deployment (for example, the Iranian and the international one), not per node. Until the shared cache of [#10](https://github.com/mdastpak/crypto-blog/issues/10), the call reaches the one node the load balancer picks, and the other nodes refresh when their 5-minute lifetime ends.

## Preview

With `WEB_PREVIEW_URL` set (the blog deployment editors use), each article and campaign gets a **Preview** button in the admin panel. It opens `WEB_PREVIEW_URL/api/preview` with a link signed by `REVALIDATE_SECRET` for that document and locale, valid for an hour; the blog shows the latest draft ([pages.md](pages.md#publishing-and-preview)).

## Staff sign-in

An account in this CMS publishes under the exchange's name, so a password alone does not protect it ([#30](https://github.com/mdastpak/crypto-blog/issues/30)). In production, staff reach the CMS only through an identity-aware proxy (oauth2-proxy, Pomerium, Cloudflare Access, or the like) that signs them in with the company's identity provider and its second factor (a passkey or TOTP):

1. The proxy signs the person in, then forwards each request with the header `X-CMS-Proxy-Secret: <CMS_AUTH_PROXY_SECRET>` and the person's email in `CMS_AUTH_PROXY_EMAIL_HEADER` (`X-Auth-Request-Email` by default). It must overwrite both headers if a client sends them.
2. Without the secret, the CMS answers `403` to the admin panel (`/admin`), the account routes (`/api/users/...`, which include sign-in and password reset), and any request that carries a staff session (the `payload-token` cookie or an `Authorization: JWT` header). See `apps/cms/src/proxy.ts`.
3. A password sign-in succeeds only for the account whose email the proxy sent, so a stolen password is no use to another person who passed the proxy.
4. Requests without credentials, which read only published documents, and requests with a machine's API key (the blog's preview, the news worker) do not need the proxy; they reach the CMS on the internal network.

The CMS refuses to start in production without a secret of 32 or more characters. `CMS_AUTH_PROXY_REQUIRED=false` turns the requirement off, for a deployment that cannot run a proxy yet; the CMS then logs a warning at every start. `CMS_AUTH_PROXY_REQUIRED=true` turns it on outside production. The seed's account (`admin@example.com`) cannot sign in in production.

Guessing passwords from one address is the edge's to limit: for example nginx `limit_req` of a few requests per minute on `/api/users/login` per client address.

## Deployment

- **Never on a public blog domain.** Serve the admin panel on an internal domain or behind a VPN (`CMS_PUBLIC_URL`). The blog only needs the read API.
- **Database**: its own PostgreSQL database and role, not the exchange's.
- **Media**: `S3_*`, any S3-compatible store. Required in production, because local disk is not shared between nodes; the CMS refuses to start without it.
- **Media types**: PNG, JPEG, WebP, and AVIF only. SVG is refused ([#29](https://github.com/mdastpak/crypto-blog/issues/29)): it can carry script, and the CMS serves files from its own origin, where a script opened by an editor or an admin would act with their session. Every file is served with `Content-Security-Policy: sandbox` and `nosniff`, and an SVG stored earlier is downloaded instead of shown. A CDN in front of the bucket (`CMS_MEDIA_URL`) must send the same two headers.
- **Security headers**: every CMS response has a Content-Security-Policy (this origin and inline scripts only, no plugins, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, and HSTS in production (`HSTS=false` at build time turns it off where the panel is not on HTTPS); see `apps/cms/src/security/headers.ts`.
- **Migrations**: schema changes are migrations (`pnpm --filter cms migrate:create <name>`), never pushed at start-up. Run them once per release, before the new version takes traffic, with the `cms-migrate` image or `pnpm --filter cms migrate`. The runner holds a PostgreSQL advisory lock, so a job started twice, or on several nodes, runs them once.
- **Nodes**: the CMS is stateless besides PostgreSQL and S3, so any number of nodes can run behind a load balancer with the same `PAYLOAD_SECRET`.
- **Health**: `GET /health/live` (process up), `GET /health/ready` (`503 database_unavailable` while PostgreSQL does not answer).
- **Images**: `docker build --target cms .` and `docker build --target cms-migrate .`.

## Settings

| Variable                                                                            | Meaning                                                                 |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`                                                                      | PostgreSQL connection string                                            |
| `PAYLOAD_SECRET`                                                                    | At least 32 random characters; the same on every node                   |
| `CMS_PUBLIC_URL`                                                                    | Where the admin panel is served                                         |
| `WEB_REVALIDATE_URLS`                                                               | Revalidation endpoints of the web deployments, comma-separated          |
| `REVALIDATE_SECRET`                                                                 | Shared with the web app; at least 32 characters when revalidation is on |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Media storage                                                           |
| `CMS_AUTH_PROXY_SECRET`                                                             | The sign-in proxy's secret, 32+ characters; required in production      |
| `CMS_AUTH_PROXY_EMAIL_HEADER`                                                       | The header of the email the proxy signed in (`x-auth-request-email`)    |
| `CMS_AUTH_PROXY_REQUIRED`                                                           | `true` or `false`; on in production by default                          |

The build needs none of them; every invalid value is reported at once at start-up.

## Tests

`pnpm --filter cms test` runs unit tests (signatures, revalidation, settings, roles, staff sign-in) and, with `TEST_DATABASE_URL` set to an empty database, integration tests against PostgreSQL: migrations, drafts, staff sign-in and API keys, publishing rights, own-document edits, role changes, localization fallback, validation, and the revalidation call. CI runs both, checks that migrations run twice cleanly, that the generated types and import map are current, and that the schema needs no new migration.
