// @vitest-environment node
import { CacheConfigError, createRedis, redisMode } from "./redis";

describe("cache redis settings", () => {
  it("picks cluster, then sentinel, then a URL, else none", () => {
    expect(redisMode({})).toBeUndefined();
    expect(createRedis({})).toBeUndefined();
    expect(redisMode({ CACHE_REDIS_URL: "redis://r" })).toBe("url");
    expect(redisMode({ CACHE_REDIS_URL: "redis://r", CACHE_REDIS_SENTINELS: "s:26379" })).toBe(
      "sentinel",
    );
    expect(redisMode({ CACHE_REDIS_SENTINELS: "s:1", CACHE_REDIS_CLUSTER: "c:1" })).toBe("cluster");
  });

  it("refuses incomplete or malformed settings", () => {
    expect(() => createRedis({ CACHE_REDIS_SENTINELS: "s:26379" })).toThrow(CacheConfigError);
    expect(() => createRedis({ CACHE_REDIS_CLUSTER: "no-port" })).toThrow(/not host:port/);
  });
});
