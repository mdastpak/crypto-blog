import type { CatalogCache } from "./coins.ts";
import { sourceRegions, type Config } from "./config.ts";
import type { Pool } from "./db.ts";
import type { PoliteHttp } from "./http.ts";
import { log } from "./log.ts";
import type { Metrics } from "./metrics.ts";
import { normalizeEntry } from "./normalize.ts";
import { PROVIDERS } from "./providers.ts";
import { claimDue, nextFetch, release, releaseAll, saveItem, type LeasedSource } from "./store.ts";

const MAX_ENTRIES = 200;

export interface WorkerDeps {
  pool: Pool;
  http: PoliteHttp;
  catalog: CatalogCache;
  metrics: Metrics;
  config: Pick<
    Config,
    "workerId" | "concurrency" | "leaseSeconds" | "pollSeconds" | "region" | "clusterWindowHours"
  >;
  now?: () => Date;
}

/** Fetches one leased source, stores its new items, and ends the lease. */
export async function processSource(deps: WorkerDeps, source: LeasedSource): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const provider = PROVIDERS[source.kind];
  const fetched = provider
    ? await provider.fetch(source, deps.http)
    : {
        kind: "error" as const,
        reason: `unknown kind ${source.kind}`,
        retryAfterSeconds: undefined,
      };
  const labels = { source: source.id };

  if (fetched.kind !== "entries") {
    const failed = fetched.kind === "error" || fetched.kind === "blocked";
    deps.metrics.inc("news_fetches_total", { ...labels, result: fetched.kind });
    if (failed)
      log("warn", "fetch failed", {
        source: source.id,
        result: fetched.kind,
        reason: fetched.reason,
      });
    await release(deps.pool, deps.config.workerId, source, {
      status: fetched.kind,
      error: failed ? fetched.reason : undefined,
      nextFetchAt: nextFetch(
        source.intervalSeconds,
        failed ? source.consecutiveFailures + 1 : 0,
        now,
        fetched.kind === "error" ? fetched.retryAfterSeconds : undefined,
      ),
    });
    return;
  }

  const matcher = await deps.catalog.current();
  const counts = { new_story: 0, joined_story: 0, duplicate: 0, invalid: 0 };
  for (const entry of fetched.entries.slice(0, MAX_ENTRIES)) {
    const item = normalizeEntry(entry, {
      language: source.language,
      license: source.license,
      feedUrl: fetched.baseUrl,
      now,
    });
    if (!item) {
      counts.invalid += 1;
      continue;
    }
    const coins = matcher.match(item.title, item.summary ?? "");
    counts[await saveItem(deps.pool, source, { ...item, coins }, deps.config.clusterWindowHours)] +=
      1;
  }
  for (const [outcome, n] of Object.entries(counts)) {
    if (n) deps.metrics.inc("news_items_total", { ...labels, outcome }, n);
  }
  deps.metrics.inc("news_fetches_total", { ...labels, result: "ok" });
  log("info", "fetched", { source: source.id, ...counts });
  await release(deps.pool, deps.config.workerId, source, {
    status: "ok",
    etag: fetched.etag,
    lastModified: fetched.lastModified,
    nextFetchAt: nextFetch(source.intervalSeconds, 0, now),
  });
}

/**
 * The worker loop: every poll, lease as many due sources as there are free
 * slots, and process them concurrently. `stop()` stops claiming, waits for
 * the sources in hand, and releases any lease left.
 */
export class Worker {
  private readonly inFlight = new Set<Promise<void>>();
  private timer: NodeJS.Timeout | undefined;
  private stopping = false;
  private ticking = false;

  constructor(private readonly deps: WorkerDeps) {}

  get running(): boolean {
    return !this.stopping;
  }

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.deps.config.pollSeconds * 1000);
  }

  async tick(): Promise<void> {
    if (this.stopping || this.ticking) return;
    this.ticking = true;
    try {
      const free = this.deps.config.concurrency - this.inFlight.size;
      if (free <= 0) return;
      const sources = await claimDue(
        this.deps.pool,
        this.deps.config.workerId,
        free,
        this.deps.config.leaseSeconds,
        sourceRegions(this.deps.config.region),
      );
      for (const source of sources) {
        const job: Promise<void> = processSource(this.deps, source)
          .catch((error) =>
            log("error", "source failed", { source: source.id, error: String(error) }),
          )
          .finally(() => this.inFlight.delete(job));
        this.inFlight.add(job);
      }
    } catch (error) {
      log("error", "claim failed", { error: String(error) });
    } finally {
      this.ticking = false;
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await Promise.allSettled([...this.inFlight]);
    await releaseAll(this.deps.pool, this.deps.config.workerId);
  }
}
