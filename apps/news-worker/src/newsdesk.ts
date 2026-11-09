import type { Channel, PostPayload } from "./channels.ts";
import { ChannelError } from "./channels.ts";
import type { CmsClient, NewsData, PublishedNews } from "./cms.ts";
import type { Config, DraftingConfig, Locale } from "./config.ts";
import type { Pool } from "./db.ts";
import { log } from "./log.ts";
import type { Metrics } from "./metrics.ts";
import { reviewDecision } from "./policy.ts";
import type { Story, Writer } from "./writer.ts";

/** After this many failed tries a draft or a post is marked failed, for an operator. */
export const MAX_ATTEMPTS = 8;

/** The wait before the next try: a minute, doubled per failure, at most 6 hours. */
export function retryDelaySeconds(attempts: number, retryAfterSeconds?: number): number {
  return Math.max(Math.min(60 * 2 ** Math.max(attempts - 1, 0), 6 * 3600), retryAfterSeconds ?? 0);
}

/**
 * Claims a periodic job for this period: of all nodes asking, exactly one
 * gets true until `everySeconds` have passed.
 */
export async function claimSchedule(
  pool: Pool,
  name: string,
  everySeconds: number,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO news_schedules (name, next_run_at) VALUES ($1, now() + make_interval(secs => $2))
     ON CONFLICT (name) DO UPDATE SET next_run_at = EXCLUDED.next_run_at
      WHERE news_schedules.next_run_at <= now()
     RETURNING name`,
    [name, everySeconds],
  );
  return rowCount === 1;
}

export interface StoryRules {
  languages: Locale[];
  /** The writer drafts in every configured language, not only the story's. */
  translates: boolean;
  minSources: number;
  settleMinutes: number;
  maxAgeHours: number;
  requireCoins: boolean;
}

/**
 * Queues a draft job for every story that is ready: reported by enough
 * sources, old enough for more to join (settle), young enough to be news,
 * and about a coin if required. Idempotent: a story is queued once per
 * language, whoever runs it.
 */
export async function queueStories(pool: Pool, rules: StoryRules): Promise<number> {
  const { rowCount } = await pool.query(
    `INSERT INTO news_drafts (cluster_id, language, external_id)
     SELECT c.id, l.lang, 'story-' || c.id || '-' || floor(extract(epoch FROM c.first_seen_at))::bigint
       FROM news_clusters c
       CROSS JOIN LATERAL unnest(CASE WHEN $1 THEN $2::text[] ELSE ARRAY[c.language] END) AS l(lang)
      WHERE l.lang = ANY($2::text[])
        AND c.first_seen_at > now() - make_interval(hours => $3)
        AND c.first_seen_at <= now() - make_interval(mins => $4)
        AND (NOT $5 OR cardinality(c.coins) > 0)
        AND (SELECT count(DISTINCT i.source_id) FROM news_items i WHERE i.cluster_id = c.id) >= $6
     ON CONFLICT DO NOTHING`,
    [
      rules.translates,
      rules.languages,
      rules.maxAgeHours,
      rules.settleMinutes,
      rules.requireCoins,
      rules.minSources,
    ],
  );
  return rowCount ?? 0;
}

export interface DraftJob {
  clusterId: string;
  language: Locale;
  externalId: string;
  attempts: number;
}

export async function claimDrafts(
  pool: Pool,
  owner: string,
  limit: number,
  leaseSeconds: number,
): Promise<DraftJob[]> {
  const { rows } = await pool.query(
    `UPDATE news_drafts d
        SET lease_owner = $1, lease_until = now() + make_interval(secs => $3)
      WHERE (d.cluster_id, d.language) IN (
        SELECT cluster_id, language FROM news_drafts
         WHERE status = 'pending' AND next_attempt_at <= now()
           AND (lease_until IS NULL OR lease_until < now())
         ORDER BY next_attempt_at
         LIMIT $2
         FOR UPDATE SKIP LOCKED)
      RETURNING cluster_id, language, external_id, attempts`,
    [owner, limit, leaseSeconds],
  );
  return rows.map((r) => ({
    clusterId: String(r.cluster_id),
    language: r.language,
    externalId: r.external_id,
    attempts: r.attempts,
  }));
}

/** A story with its reports, oldest first. */
export async function loadStory(pool: Pool, clusterId: string): Promise<Story | undefined> {
  const cluster = await pool.query(
    "SELECT id, language, title, coins, first_seen_at FROM news_clusters WHERE id = $1",
    [clusterId],
  );
  const c = cluster.rows[0];
  if (!c) return undefined;
  const items = await pool.query(
    `SELECT i.source_id, s.name, i.url, i.title, i.published_at, i.region
       FROM news_items i JOIN news_sources s ON s.id = i.source_id
      WHERE i.cluster_id = $1
      ORDER BY i.published_at, i.id
      LIMIT 50`,
    [clusterId],
  );
  return {
    id: String(c.id),
    language: c.language,
    title: c.title,
    coins: c.coins,
    firstSeenAt: c.first_seen_at,
    items: items.rows.map((r) => ({
      sourceId: r.source_id,
      sourceName: r.name,
      url: r.url,
      title: r.title,
      publishedAt: r.published_at,
      region: r.region,
    })),
  };
}

export type DraftOutcome =
  | { kind: "pushed"; cmsId: string; published: boolean }
  | { kind: "skipped"; reason: string }
  | { kind: "retry"; error: string; retryAfterSeconds?: number };

/** Records a draft job's outcome, only while this worker holds its lease. */
export async function finishDraft(
  pool: Pool,
  owner: string,
  job: DraftJob,
  outcome: DraftOutcome,
): Promise<"pushed" | "skipped" | "retry" | "failed" | "lost"> {
  let sql: string;
  let params: unknown[];
  if (outcome.kind === "retry") {
    const attempts = job.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    sql = `UPDATE news_drafts SET status = $4, attempts = $5, last_error = $6,
                  next_attempt_at = now() + make_interval(secs => $7)`;
    params = [
      failed ? "failed" : "pending",
      attempts,
      outcome.error,
      retryDelaySeconds(attempts, outcome.retryAfterSeconds),
    ];
  } else if (outcome.kind === "pushed") {
    sql =
      "UPDATE news_drafts SET status = 'pushed', cms_id = $4, published = $5, last_error = NULL";
    params = [outcome.cmsId, outcome.published];
  } else {
    sql = "UPDATE news_drafts SET status = 'skipped', last_error = $4";
    params = [outcome.reason];
  }
  const { rowCount } = await pool.query(
    `${sql}, lease_owner = NULL, lease_until = NULL, updated_at = now()
      WHERE cluster_id = $1 AND language = $2 AND lease_owner = $3`,
    [job.clusterId, job.language, owner, ...params],
  );
  if (rowCount !== 1) return "lost";
  if (outcome.kind === "retry") return job.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "retry";
  return outcome.kind;
}

/** A URL slug: the English headline's words when there are any, and the story's id. */
export function slugFor(job: Pick<DraftJob, "externalId">, title: string, language: Locale) {
  const [, id, epoch] = /^story-(\d+)-(\d+)$/.exec(job.externalId) ?? [];
  const suffix = `${id ?? "0"}-${Number(epoch ?? 0).toString(36)}`;
  const words =
    language === "en"
      ? title
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60)
          .replace(/-+$/, "")
      : "";
  return `${words || "news"}-${suffix}`;
}

export interface DeskDeps {
  pool: Pool;
  cms: Pick<CmsClient, "findByExternalId" | "create" | "addLocale" | "publishedNewsSince">;
  writer: Writer;
  channels: Channel[];
  metrics: Metrics;
  config: Pick<Config, "workerId" | "leaseSeconds" | "pollSeconds" | "region">;
  drafting: DraftingConfig;
}

/**
 * Writes one story in one language and puts it in the CMS: a new article
 * (a draft, unless the review policy publishes it, labeled), or a new
 * locale of the article another language already made (always a draft).
 * Idempotent: the article is found by the story's id first.
 */
export async function pushDraft(deps: DeskDeps, job: DraftJob): Promise<DraftOutcome> {
  const story = await loadStory(deps.pool, job.clusterId);
  if (!story || story.items.length === 0) return { kind: "skipped", reason: "story removed" };
  const existing = await deps.cms.findByExternalId(job.externalId);
  if (existing?.title?.[job.language]) {
    return { kind: "pushed", cmsId: existing.id, published: existing._status === "published" };
  }
  const draft = await deps.writer.write(story, job.language);
  const data: NewsData = {
    type: "news",
    title: draft.title,
    excerpt: draft.summary,
    body: draft.body,
    coins: draft.coins,
    sources: draft.sources,
    generatedBy: deps.writer.id,
    // Only Iranian reports: an Iranian story, hidden in an international release.
    regions: story.items.every((item) => item.region === "ir") ? ["ir"] : [],
  };
  if (existing) {
    const doc = await deps.cms.addLocale(existing.id, data, job.language);
    return { kind: "pushed", cmsId: doc.id, published: false };
  }
  const decision = reviewDecision(story, {
    autoPublishMinSources: deps.drafting.autoPublishMinSources,
  });
  const doc = await deps.cms.create(
    {
      ...data,
      slug: slugFor(job, draft.title, job.language),
      externalId: job.externalId,
      autoPublished: decision.publish,
    },
    job.language,
    decision.publish,
  );
  log("info", decision.publish ? "news published" : "news drafted", {
    story: story.id,
    language: job.language,
    cms: doc.id,
    policy: decision.reason,
  });
  return { kind: "pushed", cmsId: doc.id, published: decision.publish };
}

/** Records the configured channels; returns when each was first seen. */
export async function registerChannels(pool: Pool, ids: string[]): Promise<Map<string, Date>> {
  if (ids.length === 0) return new Map();
  await pool.query(
    "INSERT INTO news_channels (id) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING",
    [ids],
  );
  const { rows } = await pool.query("SELECT id, since FROM news_channels WHERE id = ANY($1)", [
    ids,
  ]);
  return new Map(rows.map((r) => [r.id as string, r.since as Date]));
}

export interface ChannelTarget {
  id: string;
  locale: Locale;
  since: Date;
}

/**
 * Queues a post per channel for each published news article: in the
 * channel's locale only (no fallback), shown in this release's region, and
 * published after the channel was configured. Idempotent.
 */
export async function queuePosts(
  pool: Pool,
  targets: ChannelTarget[],
  docs: PublishedNews[],
  blogUrl: string,
  region: Config["region"],
): Promise<number> {
  let queued = 0;
  for (const doc of docs) {
    if (doc.regions?.length && !doc.regions.includes(region)) continue;
    for (const target of targets) {
      const title = doc.title?.[target.locale];
      if (!title || new Date(doc.publishedAt) <= target.since) continue;
      const payload: PostPayload = {
        title,
        summary: doc.excerpt?.[target.locale] ?? undefined,
        url: `${blogUrl}/${target.locale}/blog/${doc.slug}`,
      };
      const { rowCount } = await pool.query(
        `INSERT INTO news_outbox (channel, article_id, locale, payload)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [target.id, doc.id, target.locale, payload],
      );
      queued += rowCount ?? 0;
    }
  }
  return queued;
}

export interface PostJob {
  id: string;
  channel: string;
  payload: PostPayload;
  attempts: number;
}

export async function claimPosts(
  pool: Pool,
  owner: string,
  limit: number,
  leaseSeconds: number,
  channels: string[],
): Promise<PostJob[]> {
  const { rows } = await pool.query(
    `UPDATE news_outbox o
        SET lease_owner = $1, lease_until = now() + make_interval(secs => $3)
      WHERE o.id IN (
        SELECT id FROM news_outbox
         WHERE status = 'pending' AND channel = ANY($4) AND next_attempt_at <= now()
           AND (lease_until IS NULL OR lease_until < now())
         ORDER BY next_attempt_at, id
         LIMIT $2
         FOR UPDATE SKIP LOCKED)
      RETURNING id, channel, payload, attempts`,
    [owner, limit, leaseSeconds, channels],
  );
  return rows.map((r) => ({
    id: String(r.id),
    channel: r.channel,
    payload: r.payload,
    attempts: r.attempts,
  }));
}

/**
 * Sends one post and records the result. A rejected post (bad token or
 * chat) fails at once; a network error, 5xx, or rate limit is retried with
 * backoff. Delivery is at least once: a crash between the send and this
 * record sends it again after the lease ends.
 */
export async function deliver(
  pool: Pool,
  owner: string,
  channel: Channel,
  job: PostJob,
): Promise<"sent" | "retry" | "failed" | "lost"> {
  let sql: string;
  let params: unknown[];
  let result: "sent" | "retry" | "failed";
  try {
    const remoteId = await channel.send(job.payload);
    sql = "status = 'sent', remote_id = $3, sent_at = now(), last_error = NULL";
    params = [remoteId];
    result = "sent";
  } catch (error) {
    const attempts = job.attempts + 1;
    const retryable = !(error instanceof ChannelError) || error.retryable;
    result = retryable && attempts < MAX_ATTEMPTS ? "retry" : "failed";
    const retryAfter = error instanceof ChannelError ? error.retryAfterSeconds : undefined;
    sql = `status = $3, attempts = $4, last_error = $5,
           next_attempt_at = now() + make_interval(secs => $6)`;
    params = [
      result === "retry" ? "pending" : "failed",
      attempts,
      error instanceof Error ? error.message : String(error),
      retryDelaySeconds(attempts, retryAfter),
    ];
  }
  const { rowCount } = await pool.query(
    `UPDATE news_outbox SET ${sql}, lease_owner = NULL, lease_until = NULL
      WHERE id = $1 AND lease_owner = $2`,
    [job.id, owner, ...params],
  );
  return rowCount === 1 ? result : "lost";
}

/** Ends this worker's draft and post leases, at shutdown. */
export async function releaseDesk(pool: Pool, owner: string): Promise<void> {
  await pool.query(
    "UPDATE news_drafts SET lease_owner = NULL, lease_until = NULL WHERE lease_owner = $1",
    [owner],
  );
  await pool.query(
    "UPDATE news_outbox SET lease_owner = NULL, lease_until = NULL WHERE lease_owner = $1",
    [owner],
  );
}

const SCHEDULE_SECONDS = 60;
const BATCH = 4;

/**
 * The newsroom loop, next to the collector: every poll it queues ready
 * stories and published news (once per minute across all nodes), then
 * drafts and posts what it leases.
 */
export class Newsdesk {
  private timer: NodeJS.Timeout | undefined;
  private stopping = false;
  private current: Promise<void> | undefined;
  private since: Map<string, Date> | undefined;

  constructor(private readonly deps: DeskDeps) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.deps.config.pollSeconds * 1000);
  }

  tick(): Promise<void> {
    if (this.stopping || this.current) return this.current ?? Promise.resolve();
    this.current = this.run()
      .catch((error) => log("error", "newsdesk failed", { error: String(error) }))
      .finally(() => {
        this.current = undefined;
      });
    return this.current;
  }

  private async run(): Promise<void> {
    const { pool, drafting, config, metrics } = this.deps;
    if (await claimSchedule(pool, "queue-stories", SCHEDULE_SECONDS)) {
      const queued = await queueStories(pool, {
        languages: drafting.languages,
        translates: this.deps.writer.translates,
        minSources: drafting.minSources,
        settleMinutes: drafting.settleMinutes,
        maxAgeHours: drafting.maxAgeHours,
        requireCoins: drafting.requireCoins,
      });
      if (queued) log("info", "stories queued for drafting", { queued });
    }

    for (const job of await claimDrafts(pool, config.workerId, BATCH, config.leaseSeconds)) {
      if (this.stopping) break;
      let outcome: DraftOutcome;
      try {
        outcome = await pushDraft(this.deps, job);
      } catch (error) {
        outcome = { kind: "retry", error: String(error) };
        log("warn", "draft failed", { story: job.clusterId, error: String(error) });
      }
      const result = await finishDraft(pool, config.workerId, job, outcome);
      const label =
        result === "pushed" && outcome.kind === "pushed" && outcome.published
          ? "published"
          : result;
      metrics.inc("news_drafts_total", { language: job.language, result: label });
    }

    if (this.deps.channels.length === 0 || !drafting.blogPublicUrl) return;
    this.since ??= await registerChannels(
      pool,
      this.deps.channels.map((c) => c.id),
    );
    if (await claimSchedule(pool, "queue-posts", SCHEDULE_SECONDS)) {
      const lookback = new Date(Date.now() - drafting.channelLookbackHours * 3600_000);
      const targets = drafting.channels.map((c) => ({
        id: c.id,
        locale: c.locale,
        since: this.since!.get(c.id) ?? new Date(),
      }));
      const earliest = new Date(
        Math.max(lookback.getTime(), Math.min(...targets.map((t) => t.since.getTime()))),
      );
      const docs = await this.deps.cms.publishedNewsSince(earliest);
      const queued = await queuePosts(pool, targets, docs, drafting.blogPublicUrl, config.region);
      if (queued) log("info", "posts queued", { queued });
    }
    const byId = new Map(this.deps.channels.map((c) => [c.id, c]));
    const posts = await claimPosts(pool, config.workerId, BATCH, config.leaseSeconds, [
      ...byId.keys(),
    ]);
    for (const job of posts) {
      const result = await deliver(pool, config.workerId, byId.get(job.channel)!, job);
      if (result !== "sent") log("warn", "post not sent", { channel: job.channel, result });
      metrics.inc("news_posts_total", { channel: job.channel, result });
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.current;
    await releaseDesk(this.deps.pool, this.deps.config.workerId);
  }
}
