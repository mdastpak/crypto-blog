/**
 * Runs the store against a real PostgreSQL (TEST_DATABASE_URL, emptied
 * first): migrations, source sync, leases with two workers, deduplication,
 * clustering, and a whole fetch from recorded feeds. Skipped without
 * TEST_DATABASE_URL; CI sets it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CatalogCache, createMatcher } from "./coins.ts";
import { createPool, migrate, pendingMigrations, type Pool } from "./db.ts";
import { fixture } from "./fixtures.ts";
import { PoliteHttp, type FetchFn } from "./http.ts";
import { Metrics } from "./metrics.ts";
import { normalizeEntry } from "./normalize.ts";
import { parseFeed } from "./feed.ts";
import { syncSources, type Source } from "./sources.ts";
import { claimDue, release, saveItem } from "./store.ts";
import { processSource, type WorkerDeps } from "./worker.ts";
import { ChannelError, type Channel } from "./channels.ts";
import type { CmsClient, ExistingArticle, NewsData, PublishedNews } from "./cms.ts";
import type { DraftingConfig, Locale } from "./config.ts";
import {
  claimDrafts,
  claimPosts,
  claimSchedule,
  deliver,
  finishDraft,
  MAX_ATTEMPTS,
  Newsdesk,
  pushDraft,
  queuePosts,
  queueStories,
  registerChannels,
  type DeskDeps,
} from "./newsdesk.ts";
import { TemplateWriter } from "./writer.ts";

const databaseUrl = process.env.TEST_DATABASE_URL;

const source = (id: string, extra: Partial<Source> = {}): Source => ({
  id,
  name: id,
  kind: "rss",
  url: `https://${id}.example/feed`,
  language: "en",
  region: "global",
  license: "headline",
  intervalMinutes: 15,
  enabled: true,
  ...extra,
});

describe.skipIf(!databaseUrl)("news store with PostgreSQL", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createPool(databaseUrl!, 10);
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    const all = ["001_init.sql", "002_drafts_outbox.sql"];
    expect(await pendingMigrations(pool)).toEqual(all);
    // Two release jobs at once: the migrations run once.
    const [a, b] = await Promise.all([migrate(pool), migrate(pool)]);
    expect([...a, ...b]).toEqual(all);
    expect(await migrate(pool)).toEqual([]);
    expect(await pendingMigrations(pool)).toEqual([]);
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE news_outbox, news_channels, news_schedules, news_drafts, news_items,
                news_clusters, news_sources RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("syncs the sources file, disabling the ones removed", async () => {
    await syncSources(pool, [source("aa"), source("bb")]);
    await syncSources(pool, [source("aa", { name: "renamed" })]);
    const { rows } = await pool.query("SELECT id, name, enabled FROM news_sources ORDER BY id");
    expect(rows).toEqual([
      { id: "aa", name: "renamed", enabled: true },
      { id: "bb", name: "bb", enabled: false },
    ]);
  });

  it("gives each due source to one worker only, and takes back an expired lease", async () => {
    await syncSources(
      pool,
      Array.from({ length: 10 }, (_, i) => source(`s${i}`)),
    );
    const [one, two] = await Promise.all([
      claimDue(pool, "worker-1", 6, 60, ["global"]),
      claimDue(pool, "worker-2", 6, 60, ["global"]),
    ]);
    const ids = [...one, ...two].map((s) => s.id);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    expect(await claimDue(pool, "worker-3", 10, 60, ["global"])).toEqual([]);

    // worker-1 dies: its leases expire, and another worker takes them.
    await pool.query(
      "UPDATE news_sources SET lease_until = now() - interval '1 second' WHERE lease_owner = 'worker-1'",
    );
    const taken = await claimDue(pool, "worker-3", 10, 60, ["global"]);
    expect(taken.map((s) => s.id).sort()).toEqual(one.map((s) => s.id).sort());
    // The dead worker's late release changes nothing.
    expect(
      await release(pool, "worker-1", one[0]!, { status: "ok", nextFetchAt: new Date() }),
    ).toBe(false);
  });

  it("collects Iranian sources only where the release allows", async () => {
    await syncSources(pool, [source("ir-news", { region: "ir", language: "fa" }), source("world")]);
    expect((await claimDue(pool, "w", 10, 60, ["global"])).map((s) => s.id)).toEqual(["world"]);
    expect((await claimDue(pool, "w2", 10, 60, ["ir", "global"])).map((s) => s.id)).toEqual([
      "ir-news",
    ]);
  });

  it("saves the same story from two sources once per URL, in one cluster", async () => {
    await syncSources(pool, [source("aa"), source("bb")]);
    const now = new Date("2026-11-09T12:00:00Z");
    const opts = { language: "en" as const, license: "headline" as const, now };
    const a = normalizeEntry(parseFeed(fixture("example-news.rss.xml")).entries[0]!, {
      ...opts,
      feedUrl: "https://aa.example/feed",
    })!;
    const b = normalizeEntry(parseFeed(fixture("second-source.atom.xml")).entries[0]!, {
      ...opts,
      feedUrl: "https://bb.example/feed",
    })!;
    expect(
      await saveItem(pool, { id: "aa", region: "global" }, { ...a, coins: ["bitcoin"] }, 48),
    ).toBe("new_story");
    expect(
      await saveItem(pool, { id: "aa", region: "global" }, { ...a, coins: ["bitcoin"] }, 48),
    ).toBe("duplicate");
    expect(
      await saveItem(
        pool,
        { id: "bb", region: "global" },
        { ...b, coins: ["bitcoin", "ethereum"] },
        48,
      ),
    ).toBe("joined_story");
    const { rows } = await pool.query("SELECT item_count, coins FROM news_clusters");
    expect(rows).toEqual([{ item_count: 2, coins: ["bitcoin", "ethereum"] }]);
  });

  it("makes one cluster when two workers save the same story at once", async () => {
    await syncSources(pool, [source("aa"), source("bb")]);
    const now = new Date();
    const item = (url: string, title: string) =>
      normalizeEntry(
        { title, link: url },
        { language: "en", license: "headline", feedUrl: url, now },
      )!;
    await Promise.all([
      saveItem(
        pool,
        { id: "aa", region: "global" },
        { ...item("https://aa.example/x", "Ethereum ETF approved by regulators"), coins: [] },
        48,
      ),
      saveItem(
        pool,
        { id: "bb", region: "global" },
        { ...item("https://bb.example/y", "Ethereum ETF approved by US regulators"), coins: [] },
        48,
      ),
    ]);
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n, sum(item_count)::int AS items FROM news_clusters",
    );
    expect(rows[0]).toEqual({ n: 1, items: 2 });
  });

  it("fetches a source end to end from a recorded feed, then gets 304", async () => {
    await syncSources(pool, [source("aa", { url: "https://aa.example/feed" })]);
    let etagSent: string | undefined;
    const fetchMock: FetchFn = async (url, init) => {
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      etagSent = init.headers["If-None-Match"];
      if (etagSent === '"v1"') return new Response(null, { status: 304 });
      return new Response(fixture("example-news.rss.xml"), { headers: { etag: '"v1"' } });
    };
    const metrics = new Metrics();
    const catalog = new CatalogCache(undefined);
    (catalog as unknown as { matcher: unknown }).matcher = createMatcher([
      { slug: "bitcoin", symbol: "BTC", name: "Bitcoin" },
      { slug: "ethereum", symbol: "ETH", name: "Ethereum" },
      { slug: "solana", symbol: "SOL", name: "Solana" },
    ]);
    const deps: WorkerDeps = {
      pool,
      http: new PoliteHttp({
        userAgent: "CryptoBlogNewsBot/0.1",
        timeoutMs: 1000,
        maxBytes: 1e6,
        hostMinIntervalMs: 0,
        fetch: fetchMock,
      }),
      catalog,
      metrics,
      config: {
        workerId: "w",
        concurrency: 1,
        leaseSeconds: 60,
        pollSeconds: 1,
        region: "ir",
        clusterWindowHours: 48,
      },
    };
    const [leased] = await claimDue(pool, "w", 1, 60, ["global"]);
    await processSource(deps, leased!);

    const items = await pool.query("SELECT title, coins, content FROM news_items ORDER BY title");
    expect(items.rows).toEqual([
      {
        title: "Bitcoin Tops $70,000 as ETF Inflows Surge",
        coins: ["bitcoin", "ethereum"],
        content: null,
      },
      { title: "Gas fees fall to a yearly low", coins: [], content: null },
      { title: "SEC Delays Decision on Solana ETF", coins: ["solana"], content: null },
    ]);
    expect(metrics.get("news_items_total", { source: "aa", outcome: "invalid" })).toBe(1);
    const state = await pool.query(
      "SELECT etag, lease_owner, last_status, next_fetch_at > now() AS later FROM news_sources",
    );
    expect(state.rows[0]).toEqual({
      etag: '"v1"',
      lease_owner: null,
      last_status: "ok",
      later: true,
    });

    // The next fetch is conditional and stores nothing new.
    await pool.query("UPDATE news_sources SET next_fetch_at = now()");
    const [again] = await claimDue(pool, "w", 1, 60, ["global"]);
    expect(again!.etag).toBe('"v1"');
    await processSource(deps, again!);
    expect(etagSent).toBe('"v1"');
    expect(metrics.get("news_fetches_total", { source: "aa", result: "not_modified" })).toBe(1);
  });

  it("backs off a failing source", async () => {
    await syncSources(pool, [source("aa")]);
    const deps = {
      pool,
      http: new PoliteHttp({
        userAgent: "CryptoBlogNewsBot/0.1",
        timeoutMs: 1000,
        maxBytes: 1e6,
        hostMinIntervalMs: 0,
        fetch: async (url: string) =>
          new Response("", { status: url.endsWith("robots.txt") ? 404 : 500 }),
      }),
      catalog: new CatalogCache(undefined),
      metrics: new Metrics(),
      config: {
        workerId: "w",
        concurrency: 1,
        leaseSeconds: 60,
        pollSeconds: 1,
        region: "ir" as const,
        clusterWindowHours: 48,
      },
    };
    const [leased] = await claimDue(pool, "w", 1, 60, ["global"]);
    await processSource(deps, leased!);
    const { rows } = await pool.query(
      "SELECT consecutive_failures, last_error, round(extract(epoch FROM next_fetch_at - now()) / 60) AS minutes FROM news_sources",
    );
    // 15 minutes doubled once.
    expect(rows[0]).toMatchObject({
      consecutive_failures: 1,
      last_error: "HTTP 500",
      minutes: "30",
    });
  });

  /** A story first seen `minutesAgo`, reported by the given sources. */
  async function addStory(
    title: string,
    sources: string[],
    { minutesAgo = 30, coins = ["bitcoin"], language = "en", region = "global" } = {},
  ): Promise<string> {
    const { rows } = await pool.query(
      `INSERT INTO news_clusters (language, title, title_tokens, coins, item_count, first_seen_at)
       VALUES ($1, $2, '{}', $3, $4, now() - make_interval(mins => $5)) RETURNING id`,
      [language, title, coins, sources.length, minutesAgo],
    );
    const id = String(rows[0].id);
    for (const [i, s] of sources.entries()) {
      await pool.query(
        `INSERT INTO news_items (source_id, cluster_id, canonical_url, url, title, language,
                                 region, published_at, content_hash, coins)
         VALUES ($1, $2, $3, $3, $4, $5, $6, now() - make_interval(mins => $7), $3, $8)`,
        [
          s,
          id,
          `https://${s}.example/${id}-${i}`,
          `${title} (${s})`,
          language,
          region,
          minutesAgo - i,
          coins,
        ],
      );
    }
    return id;
  }

  const rules = {
    languages: ["fa", "en"] as Locale[],
    translates: false,
    minSources: 2,
    settleMinutes: 20,
    maxAgeHours: 24,
    requireCoins: true,
  };

  /** The CMS's articles collection in memory, with its unique externalId. */
  class FakeCms implements Pick<
    CmsClient,
    "findByExternalId" | "create" | "addLocale" | "publishedNewsSince"
  > {
    docs: (ExistingArticle & {
      data: Record<Locale, NewsData | undefined>;
      externalId?: string;
    })[] = [];
    creates = 0;
    async findByExternalId(externalId: string) {
      return this.docs.find((d) => d.externalId === externalId);
    }
    async create(data: NewsData, locale: Locale, publish: boolean) {
      this.creates += 1;
      if (this.docs.some((d) => d.externalId === data.externalId))
        throw new Error("Value must be unique");
      const doc = {
        id: String(this.docs.length + 1),
        _status: publish ? ("published" as const) : ("draft" as const),
        title: { [locale]: data.title },
        externalId: data.externalId,
        data: { [locale]: data } as Record<Locale, NewsData>,
      };
      this.docs.push(doc);
      return doc;
    }
    async addLocale(id: string, data: NewsData, locale: Locale) {
      const doc = this.docs.find((d) => d.id === id)!;
      doc.title = { ...doc.title, [locale]: data.title };
      doc.data[locale] = data;
      return doc;
    }
    published: PublishedNews[] = [];
    async publishedNewsSince(since: Date) {
      return this.published.filter((d) => new Date(d.publishedAt) > since);
    }
  }

  const drafting = (extra: Partial<DraftingConfig> = {}): DraftingConfig => ({
    cmsApiUrl: "http://cms",
    cmsApiKey: "k".repeat(20),
    writer: "template",
    languages: ["fa", "en"],
    minSources: 2,
    settleMinutes: 20,
    maxAgeHours: 24,
    requireCoins: true,
    autoPublishMinSources: 0,
    blogPublicUrl: "https://blog.example",
    channels: [],
    channelLookbackHours: 24,
    ...extra,
  });

  const desk = (cms: FakeCms, extra: Partial<DeskDeps> = {}): DeskDeps => ({
    pool,
    cms,
    writer: new TemplateWriter(),
    channels: [],
    metrics: new Metrics(),
    config: { workerId: "w", leaseSeconds: 60, pollSeconds: 1, region: "ir" },
    drafting: drafting(),
    ...extra,
  });

  it("queues a story once it is reported by enough sources and has settled", async () => {
    await syncSources(pool, [source("aa"), source("bb"), source("cc")]);
    const ready = await addStory("Bitcoin rallies", ["aa", "bb", "aa"]);
    await addStory("One source only", ["aa", "aa"]);
    await addStory("Too fresh", ["aa", "bb"], { minutesAgo: 5 });
    await addStory("Too old", ["aa", "bb"], { minutesAgo: 25 * 60 });
    await addStory("No coins", ["aa", "bb"], { coins: [] });
    expect(await queueStories(pool, rules)).toBe(1);
    expect(await queueStories(pool, rules)).toBe(0);
    const { rows } = await pool.query("SELECT cluster_id, language, external_id FROM news_drafts");
    expect(rows).toEqual([
      {
        cluster_id: ready,
        language: "en",
        external_id: expect.stringMatching(new RegExp(`^story-${ready}-\\d+$`)),
      },
    ]);
    // A translating writer queues every configured language.
    expect(await queueStories(pool, { ...rules, translates: true })).toBe(1);
  });

  it("runs a periodic job on one node per period", async () => {
    const won = await Promise.all([1, 2, 3].map(() => claimSchedule(pool, "job", 60)));
    expect(won.filter(Boolean)).toHaveLength(1);
    await pool.query("UPDATE news_schedules SET next_run_at = now() - interval '1 second'");
    expect(await claimSchedule(pool, "job", 60)).toBe(true);
  });

  it("drafts a story into the CMS once, even when a push is retried after a crash", async () => {
    await syncSources(pool, [source("aa"), source("bb")]);
    await addStory("Bitcoin rallies past a record", ["aa", "bb"]);
    await queueStories(pool, rules);
    const [one, two] = await Promise.all([
      claimDrafts(pool, "w1", 5, 60),
      claimDrafts(pool, "w2", 5, 60),
    ]);
    expect([...one, ...two]).toHaveLength(1);
    const job = [...one, ...two][0]!;
    const owner = one.length ? "w1" : "w2";

    const cms = new FakeCms();
    const outcome = await pushDraft(desk(cms), job);
    expect(outcome).toEqual({ kind: "pushed", cmsId: "1", published: false });
    const created = cms.docs[0]!;
    expect(created._status).toBe("draft");
    expect(created.data.en).toMatchObject({
      type: "news",
      generatedBy: "template",
      autoPublished: false,
      coins: ["bitcoin"],
      regions: [],
      slug: expect.stringMatching(/^bitcoin-rallies-past-a-record-\d+-[a-z0-9]+$/),
      sources: [
        { name: "aa", url: expect.any(String), title: "Bitcoin rallies past a record (aa)" },
        { name: "bb", url: expect.any(String), title: "Bitcoin rallies past a record (bb)" },
      ],
    });

    // The worker dies before recording it; another worker pushes again.
    const again = await pushDraft(desk(cms), job);
    expect(again).toEqual({ kind: "pushed", cmsId: "1", published: false });
    expect(cms.creates).toBe(1);
    expect(await finishDraft(pool, owner, job, again)).toBe("pushed");
    expect(await finishDraft(pool, "someone-else", job, again)).toBe("lost");
    const { rows } = await pool.query("SELECT status, cms_id, lease_owner FROM news_drafts");
    expect(rows).toEqual([{ status: "pushed", cms_id: "1", lease_owner: null }]);
  });

  it("publishes at once, labeled, only when the policy allows; Iranian-only stories stay in Iran", async () => {
    await syncSources(pool, [source("aa"), source("bb", { region: "ir", language: "fa" })]);
    await addStory("Ethereum upgrade ships", ["aa", "bb"]);
    await addStory("خبر ایرانی", ["bb", "bb"], { language: "fa", region: "ir" });
    await pool.query("UPDATE news_items SET region = 'ir' WHERE source_id = 'bb'");
    await queueStories(pool, { ...rules, minSources: 1 });
    const cms = new FakeCms();
    const deps = desk(cms, { drafting: drafting({ autoPublishMinSources: 2 }) });
    for (const job of await claimDrafts(pool, "w", 5, 60)) await pushDraft(deps, job);
    const en = cms.docs.find((d) => d.data.en)!;
    expect(en._status).toBe("published");
    expect(en.data.en).toMatchObject({ autoPublished: true, regions: [] });
    const fa = cms.docs.find((d) => d.data.fa)!;
    expect(fa._status).toBe("draft");
    expect(fa.data.fa).toMatchObject({
      autoPublished: false,
      regions: ["ir"],
      slug: expect.stringMatching(/^news-/),
    });
  });

  it("retries a failing push with backoff, then marks it failed", async () => {
    await syncSources(pool, [source("aa"), source("bb")]);
    await addStory("Solana outage", ["aa", "bb"]);
    await queueStories(pool, rules);
    let result: string | undefined;
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      await pool.query("UPDATE news_drafts SET next_attempt_at = now()");
      const [job] = await claimDrafts(pool, "w", 1, 60);
      result = await finishDraft(pool, "w", job!, { kind: "retry", error: "CMS unreachable" });
    }
    expect(result).toBe("failed");
    const { rows } = await pool.query("SELECT status, attempts, last_error FROM news_drafts");
    expect(rows).toEqual([
      { status: "failed", attempts: MAX_ATTEMPTS, last_error: "CMS unreachable" },
    ]);
    await pool.query("UPDATE news_drafts SET next_attempt_at = now()");
    expect(await claimDrafts(pool, "w", 1, 60)).toEqual([]);
  });

  it("queues each published article once per channel, and never what came before the channel", async () => {
    const since = (await registerChannels(pool, ["telegram:@a", "x"])).get("x")!;
    expect((await registerChannels(pool, ["x"])).get("x")).toEqual(since);
    const after = new Date(since.getTime() + 60_000).toISOString();
    const before = new Date(since.getTime() - 60_000).toISOString();
    const doc = (
      id: string,
      publishedAt: string,
      extra: Partial<PublishedNews> = {},
    ): PublishedNews => ({
      id,
      slug: `n-${id}`,
      title: { en: `News ${id}`, fa: `خبر ${id}` },
      excerpt: { en: "Summary" },
      publishedAt,
      regions: [],
      ...extra,
    });
    const docs = [
      doc("1", after),
      doc("2", before),
      doc("3", after, { regions: ["international"] }),
      doc("4", after, { title: { en: "English only" } }),
    ];
    const targets = [
      { id: "telegram:@a", locale: "fa" as const, since },
      { id: "x", locale: "en" as const, since },
    ];
    expect(await queuePosts(pool, targets, docs, "https://blog.example", "ir")).toBe(3);
    expect(await queuePosts(pool, targets, docs, "https://blog.example", "ir")).toBe(0);
    const { rows } = await pool.query(
      "SELECT channel, article_id, payload FROM news_outbox ORDER BY article_id, channel",
    );
    expect(rows).toEqual([
      {
        channel: "telegram:@a",
        article_id: "1",
        payload: { title: "خبر 1", url: "https://blog.example/fa/blog/n-1" },
      },
      {
        channel: "x",
        article_id: "1",
        payload: { title: "News 1", summary: "Summary", url: "https://blog.example/en/blog/n-1" },
      },
      {
        channel: "x",
        article_id: "4",
        payload: {
          title: "English only",
          summary: "Summary",
          url: "https://blog.example/en/blog/n-4",
        },
      },
    ]);
  });

  it("retries a post that failed for a passing reason, and fails a rejected one at once", async () => {
    const since = (await registerChannels(pool, ["x"])).get("x")!;
    const later = new Date(since.getTime() + 1000).toISOString();
    await queuePosts(
      pool,
      [{ id: "x", locale: "en", since }],
      ["1", "2"].map((id) => ({
        id,
        slug: id,
        title: { en: id },
        excerpt: {},
        publishedAt: later,
        regions: [],
      })),
      "https://blog.example",
      "ir",
    );
    let calls = 0;
    const channel: Channel = {
      id: "x",
      async send(post) {
        calls += 1;
        if (post.title === "2") throw new ChannelError("HTTP 403: forbidden", false);
        if (calls === 1) throw new ChannelError("HTTP 503: busy", true, 120);
        return "remote-1";
      },
    };
    const jobs = await claimPosts(pool, "w", 10, 60, ["x"]);
    expect(await Promise.all(jobs.map((j) => deliver(pool, "w", channel, j)))).toEqual([
      "retry",
      "failed",
    ]);
    const first = await pool.query(
      "SELECT status, attempts, round(extract(epoch FROM next_attempt_at - now())) AS wait FROM news_outbox WHERE article_id = '1'",
    );
    expect(first.rows[0]).toMatchObject({ status: "pending", attempts: 1 });
    expect(Number(first.rows[0].wait)).toBeGreaterThanOrEqual(119);
    // Not due yet; then due, and sent.
    expect(await claimPosts(pool, "w", 10, 60, ["x"])).toEqual([]);
    await pool.query("UPDATE news_outbox SET next_attempt_at = now()");
    const [retry] = await claimPosts(pool, "w", 10, 60, ["x"]);
    expect(await deliver(pool, "w", channel, retry!)).toBe("sent");
    const { rows } = await pool.query(
      "SELECT article_id, status, remote_id FROM news_outbox ORDER BY article_id",
    );
    expect(rows).toEqual([
      { article_id: "1", status: "sent", remote_id: "remote-1" },
      { article_id: "2", status: "failed", remote_id: null },
    ]);
  });

  it("runs the whole desk: drafts, then posts what editors published", async () => {
    await syncSources(pool, [source("aa"), source("bb")]);
    await addStory("Bitcoin rallies", ["aa", "bb"]);
    const cms = new FakeCms();
    const sent: string[] = [];
    const channel: Channel = {
      id: "x",
      async send(post) {
        sent.push(post.url);
        return "1";
      },
    };
    const deps = desk(cms, {
      channels: [channel],
      drafting: drafting({
        channels: [{ kind: "x", id: "x", token: "t".repeat(30), locale: "en" }],
      }),
    });
    const newsdesk = new Newsdesk(deps);
    await newsdesk.tick();
    expect(cms.docs).toHaveLength(1);
    expect(deps.metrics.get("news_drafts_total", { language: "en", result: "pushed" })).toBe(1);

    // An editor publishes it; the next sync queues and sends the post.
    cms.published = [
      {
        id: "1",
        slug: "bitcoin-rallies",
        title: { en: "Bitcoin rallies" },
        excerpt: {},
        publishedAt: new Date(Date.now() + 1000).toISOString(),
        regions: [],
      },
    ];
    await pool.query("UPDATE news_schedules SET next_run_at = now()");
    await newsdesk.tick();
    expect(sent).toEqual(["https://blog.example/en/blog/bitcoin-rallies"]);
    await newsdesk.stop();
  });
});
