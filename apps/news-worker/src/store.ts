import { bestCluster } from "./cluster.ts";
import type { Pool } from "./db.ts";
import type { NewsItem } from "./normalize.ts";

export interface LeasedSource {
  id: string;
  name: string;
  kind: string;
  url: string;
  language: "fa" | "en";
  region: "ir" | "global";
  license: "headline" | "full";
  intervalSeconds: number;
  etag: string | null;
  lastModified: string | null;
  consecutiveFailures: number;
}

/**
 * Leases up to `limit` due sources for `owner`. `FOR UPDATE SKIP LOCKED`
 * lets any number of workers claim at once without waiting on, or taking,
 * each other's rows, and an expired lease (a worker that died) is claimed
 * again.
 */
export async function claimDue(
  pool: Pool,
  owner: string,
  limit: number,
  leaseSeconds: number,
  regions: string[],
): Promise<LeasedSource[]> {
  const { rows } = await pool.query(
    `UPDATE news_sources s
        SET lease_owner = $1, lease_until = now() + make_interval(secs => $3)
      WHERE s.id IN (
        SELECT id FROM news_sources
         WHERE enabled AND region = ANY($4) AND next_fetch_at <= now()
           AND (lease_until IS NULL OR lease_until < now())
         ORDER BY next_fetch_at
         LIMIT $2
         FOR UPDATE SKIP LOCKED)
      RETURNING id, name, kind, url, language, region, license, interval_seconds,
                etag, last_modified, consecutive_failures`,
    [owner, limit, leaseSeconds, regions],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    url: r.url,
    language: r.language,
    region: r.region,
    license: r.license,
    intervalSeconds: r.interval_seconds,
    etag: r.etag,
    lastModified: r.last_modified,
    consecutiveFailures: r.consecutive_failures,
  }));
}

export interface FetchResult {
  status: "ok" | "not_modified" | "blocked" | "error";
  error?: string;
  etag?: string;
  lastModified?: string;
  /** When to fetch next. */
  nextFetchAt: Date;
}

/** The next fetch: the interval, doubled per failure in a row up to 6 hours, or Retry-After. */
export function nextFetch(
  intervalSeconds: number,
  failures: number,
  now: Date,
  retryAfterSeconds?: number,
): Date {
  const backoff =
    failures > 0
      ? Math.min(intervalSeconds * 2 ** Math.min(failures, 8), 6 * 3600)
      : intervalSeconds;
  const seconds = Math.max(backoff, retryAfterSeconds ?? 0);
  return new Date(now.getTime() + seconds * 1000);
}

/** Records the fetch and ends the lease, only if this worker still holds it. */
export async function release(
  pool: Pool,
  owner: string,
  source: LeasedSource,
  result: FetchResult,
): Promise<boolean> {
  const failed = result.status === "error" || result.status === "blocked";
  const { rowCount } = await pool.query(
    `UPDATE news_sources
        SET lease_owner = NULL, lease_until = NULL, next_fetch_at = $3,
            etag = COALESCE($4, etag), last_modified = COALESCE($5, last_modified),
            consecutive_failures = CASE WHEN $6 THEN consecutive_failures + 1 ELSE 0 END,
            last_status = $7, last_error = $8, last_fetched_at = now()
      WHERE id = $1 AND lease_owner = $2`,
    [
      source.id,
      owner,
      result.nextFetchAt,
      result.etag ?? null,
      result.lastModified ?? null,
      failed,
      result.status,
      result.error ?? null,
    ],
  );
  return rowCount === 1;
}

/** Ends this worker's leases without recording a fetch, at shutdown. */
export async function releaseAll(pool: Pool, owner: string): Promise<void> {
  await pool.query(
    "UPDATE news_sources SET lease_owner = NULL, lease_until = NULL WHERE lease_owner = $1",
    [owner],
  );
}

export type SaveOutcome = "new_story" | "joined_story" | "duplicate";

/**
 * Stores an item and puts it in its story's cluster. Under a per-language
 * transaction lock, so two workers saving the same story at once never
 * make two clusters of it. A duplicate (same canonical URL or same text) is
 * skipped.
 */
export async function saveItem(
  pool: Pool,
  source: Pick<LeasedSource, "id" | "region">,
  item: NewsItem & { coins: string[] },
  windowHours: number,
): Promise<SaveOutcome> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `news-cluster:${item.language}`,
    ]);
    const dup = await client.query(
      "SELECT 1 FROM news_items WHERE canonical_url = $1 OR content_hash = $2 LIMIT 1",
      [item.canonicalUrl, item.contentHash],
    );
    if (dup.rowCount) {
      await client.query("COMMIT");
      return "duplicate";
    }
    const recent = await client.query<{ id: string; title_tokens: string[] }>(
      `SELECT id, title_tokens FROM news_clusters
        WHERE language = $1 AND last_seen_at > now() - make_interval(hours => $2)
        ORDER BY last_seen_at DESC LIMIT 2000`,
      [item.language, windowHours],
    );
    const match = bestCluster(
      item.titleTokens,
      recent.rows.map((r) => ({ id: r.id, tokens: r.title_tokens })),
    );
    let clusterId: string;
    if (match) {
      clusterId = match.id;
      await client.query(
        `UPDATE news_clusters
            SET item_count = item_count + 1, last_seen_at = now(),
                coins = ARRAY(SELECT DISTINCT unnest(coins || $2::text[]) ORDER BY 1)
          WHERE id = $1`,
        [clusterId, item.coins],
      );
    } else {
      const created = await client.query<{ id: string }>(
        `INSERT INTO news_clusters (language, title, title_tokens, coins, item_count)
         VALUES ($1, $2, $3, $4, 1) RETURNING id`,
        [item.language, item.title, item.titleTokens, item.coins],
      );
      clusterId = created.rows[0]!.id;
    }
    const inserted = await client.query(
      `INSERT INTO news_items (source_id, cluster_id, canonical_url, url, title, summary, content,
                               image_url, author, language, region, published_at, content_hash, coins)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT DO NOTHING`,
      [
        source.id,
        clusterId,
        item.canonicalUrl,
        item.url,
        item.title,
        item.summary ?? null,
        item.content ?? null,
        item.imageUrl ?? null,
        item.author ?? null,
        item.language,
        source.region,
        item.publishedAt,
        item.contentHash,
        item.coins,
      ],
    );
    if (!inserted.rowCount) {
      // Saved meanwhile under another language's lock: undo the cluster change.
      await client.query("ROLLBACK");
      return "duplicate";
    }
    await client.query("COMMIT");
    return match ? "joined_story" : "new_story";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
