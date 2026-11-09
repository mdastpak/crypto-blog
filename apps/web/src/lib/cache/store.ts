import type { Cluster, Redis } from "ioredis";

/** Where the shared cache keeps entries and tag invalidation times. */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** When each tag was last invalidated (ms since the epoch), if it was. */
  tagTimes(tags: string[]): Promise<Map<string, number>>;
  /** Marks the tags invalidated at `at`; a later mark replaces an earlier one. */
  markTags(tags: string[], at: number): Promise<void>;
  /** Whether the store answers now; a store that does not is skipped. */
  readonly available: boolean;
}

/**
 * A process-local store, for one node and for development: entries in a
 * bounded map, the oldest dropped first.
 */
export class MemoryStore implements CacheStore {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();
  private readonly tags = new Map<string, number>();
  readonly available = true;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(maxEntries = 5000, now: () => number = Date.now) {
    this.maxEntries = maxEntries;
    this.now = now;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    // Keep the map in last-used order.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async tagTimes(tags: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const tag of tags) {
      const at = this.tags.get(tag);
      if (at !== undefined) out.set(tag, at);
    }
    return out;
  }

  async markTags(tags: string[], at: number): Promise<void> {
    for (const tag of tags) this.tags.set(tag, Math.max(at, this.tags.get(tag) ?? 0));
  }
}

// Sets a tag's time only when it moves it forward, so that marks from
// several nodes, in any order, leave the latest.
const MARK_SCRIPT = `
for i, tag in ipairs(ARGV) do
  if i > 1 then
    local old = tonumber(redis.call('HGET', KEYS[1], tag) or '0')
    if old < tonumber(ARGV[1]) then redis.call('HSET', KEYS[1], tag, ARGV[1]) end
  end
end
return 1`;

/**
 * The shared store on Redis (a single server, Sentinel, or Cluster). Entries
 * are plain keys with a TTL; the tag times are one hash, so that a lookup of
 * many tags is one command, also on a cluster.
 */
export class RedisStore implements CacheStore {
  private readonly redis: Redis | Cluster;
  private readonly tagsKey: string;

  constructor(redis: Redis | Cluster, tagsKey: string) {
    this.redis = redis;
    this.tagsKey = tagsKey;
  }

  get available(): boolean {
    return this.redis.status === "ready";
  }

  get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, "EX", Math.max(1, Math.round(ttlSeconds)));
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async tagTimes(tags: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (tags.length === 0) return out;
    const values = await this.redis.hmget(this.tagsKey, ...tags);
    tags.forEach((tag, i) => {
      const at = Number(values[i]);
      if (values[i] != null && Number.isFinite(at)) out.set(tag, at);
    });
    return out;
  }

  async markTags(tags: string[], at: number): Promise<void> {
    if (tags.length === 0) return;
    await this.redis.eval(MARK_SCRIPT, 1, this.tagsKey, String(at), ...tags);
  }
}
