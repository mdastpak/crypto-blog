import { Cluster, Redis, type RedisOptions } from "ioredis";

/**
 * The Redis of the shared cache, from the environment:
 *
 * - `CACHE_REDIS_URL`: one server (`redis://` or `rediss://`).
 * - `CACHE_REDIS_SENTINELS` (`host:port,…`) and `CACHE_REDIS_MASTER`: a
 *   Sentinel group; the client follows failovers.
 * - `CACHE_REDIS_CLUSTER` (`host:port,…`): a Redis Cluster.
 *
 * `CACHE_REDIS_PASSWORD`, `CACHE_REDIS_USERNAME`, and `CACHE_REDIS_TLS=true`
 * apply to Sentinel and Cluster (a URL carries its own). Without any of
 * them there is no shared cache: undefined.
 *
 * Commands never queue while Redis is away: they fail at once and the page
 * is rendered instead, so a Redis outage slows pages but does not stop them.
 */
export type RedisEnv = Record<string, string | undefined>;

export class CacheConfigError extends Error {}

function hosts(list: string, name: string): { host: string; port: number }[] {
  return list.split(",").map((item) => {
    const match = /^\s*([^\s:]+):(\d{1,5})\s*$/.exec(item);
    if (!match) throw new CacheConfigError(`${name}: "${item}" is not host:port`);
    return { host: match[1]!, port: Number(match[2]) };
  });
}

export function redisMode(env: RedisEnv): "url" | "sentinel" | "cluster" | undefined {
  if (env.CACHE_REDIS_CLUSTER) return "cluster";
  if (env.CACHE_REDIS_SENTINELS) return "sentinel";
  if (env.CACHE_REDIS_URL) return "url";
  return undefined;
}

export function createRedis(env: RedisEnv): Redis | Cluster | undefined {
  const common: RedisOptions = {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: Number(env.CACHE_REDIS_TIMEOUT_MS ?? 500),
    connectTimeout: 2000,
    // Reconnect forever, at most every five seconds.
    retryStrategy: (times) => Math.min(times * 200, 5000),
  };
  const auth: RedisOptions = {
    username: env.CACHE_REDIS_USERNAME || undefined,
    password: env.CACHE_REDIS_PASSWORD || undefined,
    tls: env.CACHE_REDIS_TLS === "true" ? {} : undefined,
  };
  switch (redisMode(env)) {
    case "cluster":
      return new Cluster(hosts(env.CACHE_REDIS_CLUSTER!, "CACHE_REDIS_CLUSTER"), {
        enableOfflineQueue: false,
        redisOptions: { ...common, ...auth },
        clusterRetryStrategy: (times) => Math.min(times * 200, 5000),
      });
    case "sentinel": {
      if (!env.CACHE_REDIS_MASTER) {
        throw new CacheConfigError("CACHE_REDIS_MASTER: required with CACHE_REDIS_SENTINELS");
      }
      return new Redis({
        ...common,
        ...auth,
        sentinels: hosts(env.CACHE_REDIS_SENTINELS!, "CACHE_REDIS_SENTINELS"),
        name: env.CACHE_REDIS_MASTER,
        sentinelPassword: env.CACHE_REDIS_SENTINEL_PASSWORD || auth.password,
        enableTLSForSentinelMode: auth.tls !== undefined,
      });
    }
    case "url":
      return new Redis(env.CACHE_REDIS_URL!, common);
    default:
      return undefined;
  }
}
