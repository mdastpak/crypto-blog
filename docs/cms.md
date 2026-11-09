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

The `viewer` role is for the blog's preview: create one account with it, turn on its API key, and give the key to the web app as `CMS_PREVIEW_API_KEY`. A leaked key reads drafts but cannot change anything. Article slugs `categories`, `tags`, and `authors` are taken by blog pages and refused.

An author's attempt to publish is refused with `403`, so their work waits for review. Only admins change roles, so nobody raises their own. Visitors (no sign-in) read only published documents. Sign-in locks an account for 15 minutes after 5 failures.

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

## Deployment

- **Never on a public blog domain.** Serve the admin panel on an internal domain or behind a VPN (`CMS_PUBLIC_URL`). The blog only needs the read API.
- **Database**: its own PostgreSQL database and role, not the exchange's.
- **Media**: `S3_*`, any S3-compatible store. Required in production, because local disk is not shared between nodes; the CMS refuses to start without it.
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

The build needs none of them; every invalid value is reported at once at start-up.

## Tests

`pnpm --filter cms test` runs unit tests (signatures, revalidation, settings, roles) and, with `TEST_DATABASE_URL` set to an empty database, integration tests against PostgreSQL: migrations, drafts, publishing rights, own-document edits, role changes, localization fallback, validation, and the revalidation call. CI runs both, checks that migrations run twice cleanly, that the generated types and import map are current, and that the schema needs no new migration.
