import { readFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../log.ts";
import { createRedis, redisMode, type RedisEnv } from "./redis.ts";
import { MemoryStore, RedisStore, type CacheStore } from "./store.ts";

/** The process's cache store and the names it keeps entries under. */
export interface SharedCache {
  store: CacheStore;
  /** Prefix of entry keys: the key prefix and this build, so releases never share pages. */
  entryPrefix: string;
  shared: boolean;
}

const KEY = Symbol.for("crypto-blog.cache");
const holder = globalThis as typeof globalThis & { [KEY]?: SharedCache };

function buildId(serverDistDir: string | undefined, env: RedisEnv): string {
  if (env.CACHE_BUILD_ID) return env.CACHE_BUILD_ID;
  // The server runs from the app's directory; Next.js passes its dist dir.
  const dirs = [serverDistDir && join(serverDistDir, ".."), join(process.cwd(), ".next")];
  for (const dir of dirs) {
    if (!dir) continue;
    try {
      return readFileSync(join(dir, "BUILD_ID"), "utf8").trim();
    } catch {
      // `next dev` has no BUILD_ID.
    }
  }
  return "development";
}

/**
 * The one store of this process, made on first use. Next.js makes a cache
 * handler per request, and the revalidation webhook reaches the store too,
 * so it lives on globalThis: one Redis connection per process.
 */
export function sharedCache(serverDistDir?: string, env: RedisEnv = process.env): SharedCache {
  if (holder[KEY]) return holder[KEY];
  const prefix = env.CACHE_KEY_PREFIX || "crypto-blog";
  const redis = createRedis(env);
  let store: CacheStore;
  if (redis) {
    let down = false;
    redis.on("error", (error: Error) => {
      // One line per outage, not one per reconnect attempt.
      if (!down) logger.warn("cache redis unavailable", { error });
      down = true;
    });
    redis.on("ready", () => {
      if (down) logger.info("cache redis back");
      down = false;
    });
    store = new RedisStore(redis, `${prefix}:tags`);
    logger.info("shared cache on redis", { mode: redisMode(env) });
  } else {
    store = new MemoryStore(Number(env.CACHE_MEMORY_ENTRIES ?? 5000));
  }
  holder[KEY] = {
    store,
    entryPrefix: `${prefix}:${buildId(serverDistDir, env)}:`,
    shared: redis !== undefined,
  };
  return holder[KEY];
}

/** For tests: forgets the process's store. */
export function resetSharedCache(): void {
  delete holder[KEY];
}

/**
 * Marks tags invalidated in the shared store and waits for it, so that a
 * caller (the revalidation webhook) can fail when the mark did not reach
 * every node. A no-op before the cache handler made the store.
 */
export async function invalidateTags(tags: string[], at = Date.now()): Promise<void> {
  await holder[KEY]?.store.markTags(tags, at);
}
