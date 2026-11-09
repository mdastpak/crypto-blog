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
    expect(await pendingMigrations(pool)).toEqual(["001_init.sql"]);
    // Two release jobs at once: the migrations run once.
    const [a, b] = await Promise.all([migrate(pool), migrate(pool)]);
    expect([...a, ...b]).toEqual(["001_init.sql"]);
    expect(await migrate(pool)).toEqual([]);
    expect(await pendingMigrations(pool)).toEqual([]);
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE news_items, news_clusters, news_sources RESTART IDENTITY CASCADE");
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
});
