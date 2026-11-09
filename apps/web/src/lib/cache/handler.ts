import type {
  CacheHandler as NextCacheHandler,
  CacheHandlerContext,
  CacheHandlerValue,
} from "next/dist/server/lib/incremental-cache";
import { logger } from "../log.ts";
import { decode, encode } from "./codec.ts";
import { sharedCache, type SharedCache } from "./shared.ts";

type GetContext = Parameters<NextCacheHandler["get"]>[1];
type SetContext = Parameters<NextCacheHandler["set"]>[2];
type Value = Parameters<NextCacheHandler["set"]>[1];

/** What is stored for a cache key. */
interface Stored {
  lastModified: number;
  tags: string[];
  value: Value;
  cacheControl?: CacheHandlerValue["cacheControl"];
}

const TAGS_HEADER = "x-next-cache-tags";
const DAY = 86_400;

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Tags of a page or route entry, which Next.js keeps in a header. */
function headerTags(value: Value): string[] {
  if (!value || !("headers" in value) || !value.headers) return [];
  const header = (value.headers as Record<string, unknown>)[TAGS_HEADER];
  return typeof header === "string" && header ? header.split(",") : [];
}

/**
 * How long Redis keeps an entry. Past its revalidation time a page is still
 * served while it is rendered anew in the background, so it is kept well
 * beyond it: its `expire` when it has one, else 24 revalidation periods,
 * between a minute and CACHE_MAX_TTL_SECONDS (a week).
 */
export function ttlOf(ctx: SetContext, maxTtl: number): number {
  let revalidate: number | false | undefined;
  let expire: number | undefined;
  if ("cacheControl" in ctx && ctx.cacheControl) {
    revalidate = ctx.cacheControl.revalidate;
    expire = ctx.cacheControl.expire;
  } else if ("revalidate" in ctx) {
    revalidate = ctx.revalidate as number | false | undefined;
  }
  const wanted =
    typeof expire === "number" ? expire : typeof revalidate === "number" ? revalidate * 24 : maxTtl;
  return Math.min(maxTtl, Math.max(60, wanted));
}

/**
 * The Next.js cache handler of every node: ISR pages, route handlers, and
 * fetch results live in one store (Redis), so a page rendered on one node is
 * served by all, and a tag revalidated on any node is stale on all.
 *
 * A tag's invalidation is a time in the store; an entry is fresh only when
 * it was written after every one of its tags was invalidated (less
 * CACHE_CLOCK_SKEW_MS, for clocks that differ between nodes). Nothing is
 * deleted on revalidation, so it is idempotent and costs one write.
 *
 * When the store does not answer, reads miss (the page is rendered) and
 * writes are dropped: Redis down means slower pages, not failing ones.
 */
export default class CacheHandler implements NextCacheHandler {
  private readonly cache: SharedCache;
  private readonly revalidatedTags: string[];
  private readonly skewMs = numberEnv("CACHE_CLOCK_SKEW_MS", 1000);
  private readonly maxTtl = numberEnv("CACHE_MAX_TTL_SECONDS", 7 * DAY);

  constructor(ctx: CacheHandlerContext) {
    this.cache = sharedCache(ctx.serverDistDir);
    this.revalidatedTags = ctx.revalidatedTags ?? [];
  }

  async get(cacheKey: string, ctx: GetContext): Promise<CacheHandlerValue | null> {
    const { store, entryPrefix } = this.cache;
    if (!store.available) return null;
    try {
      const raw = await store.get(entryPrefix + cacheKey);
      if (!raw) return null;
      const entry = decode<Stored>(raw);
      const tags = new Set(entry.tags);
      if (ctx.kind === "FETCH") {
        for (const tag of [...(ctx.tags ?? []), ...(ctx.softTags ?? [])]) tags.add(tag);
        // Revalidated earlier in this same request.
        if ([...tags].some((tag) => this.revalidatedTags.includes(tag))) return null;
      }
      if (tags.size > 0) {
        const times = await store.tagTimes([...tags]);
        for (const at of times.values()) {
          if (at >= entry.lastModified - this.skewMs) return null;
        }
      }
      return {
        lastModified: entry.lastModified,
        value: entry.value,
        cacheControl: entry.cacheControl,
      };
    } catch (error) {
      logger.warn("cache read failed", { error, key: cacheKey });
      return null;
    }
  }

  async set(cacheKey: string, data: Value, ctx: SetContext): Promise<void> {
    const { store, entryPrefix } = this.cache;
    if (!store.available) return;
    try {
      if (data === null) {
        await store.delete(entryPrefix + cacheKey);
        return;
      }
      const tags =
        data.kind === "FETCH" && "tags" in ctx && Array.isArray(ctx.tags)
          ? (ctx.tags as string[])
          : headerTags(data);
      const entry: Stored = {
        lastModified: Date.now(),
        tags,
        value: data,
        cacheControl: "cacheControl" in ctx ? ctx.cacheControl : undefined,
      };
      await store.set(entryPrefix + cacheKey, encode(entry), ttlOf(ctx, this.maxTtl));
    } catch (error) {
      logger.warn("cache write failed", { error, key: cacheKey });
    }
  }

  async revalidateTag(tags: string | string[]): Promise<void> {
    const list = typeof tags === "string" ? [tags] : tags;
    if (list.length === 0) return;
    // Stale-while-revalidate profiles are treated as immediate expiry:
    // the next request renders anew.
    await this.cache.store.markTags(list, Date.now());
  }

  resetRequestCache(): void {}
}
