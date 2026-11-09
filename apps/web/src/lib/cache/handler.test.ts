// @vitest-environment node
import CacheHandler, { ttlOf } from "./handler";
import { resetSharedCache, sharedCache, invalidateTags } from "./shared";
import type { CacheStore } from "./store";

type Ctx = ConstructorParameters<typeof CacheHandler>[0];
type GetCtx = Parameters<CacheHandler["get"]>[1];
type SetCtx = Parameters<CacheHandler["set"]>[2];
type Value = Parameters<CacheHandler["set"]>[1];

const ctx = (revalidatedTags: string[] = []) => ({ revalidatedTags }) as unknown as Ctx;
const page = (tags: string) =>
  ({
    kind: "APP_PAGE",
    html: "<p>page</p>",
    rscData: Buffer.from("rsc"),
    headers: { "x-next-cache-tags": tags },
    status: 200,
  }) as unknown as Value;
const fetchValue = { kind: "FETCH", data: { body: "{}" }, revalidate: 60 } as unknown as Value;
const pageGet = { kind: "APP_PAGE" } as unknown as GetCtx;
const pageSet = { cacheControl: { revalidate: 300, expire: undefined } } as unknown as SetCtx;

beforeEach(() => {
  resetSharedCache();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  vi.useRealTimers();
  resetSharedCache();
});

describe("shared cache handler", () => {
  it("serves an entry written by another handler, with its lifetime", async () => {
    await new CacheHandler(ctx()).set("/en", page("cms:articles"), pageSet);
    const got = await new CacheHandler(ctx()).get("/en", pageGet);
    expect(got?.lastModified).toBe(1_000_000);
    expect(got?.cacheControl).toEqual({ revalidate: 300 });
    expect(Buffer.isBuffer((got?.value as { rscData: Buffer }).rscData)).toBe(true);
  });

  it("misses once any of the entry's tags is invalidated after it was written", async () => {
    const handler = new CacheHandler(ctx());
    await handler.set("/en", page("cms:articles,_N_T_/en"), pageSet);
    await handler.revalidateTag("cms:campaigns");
    expect(await handler.get("/en", pageGet)).not.toBeNull();
    vi.setSystemTime(1_005_000);
    await handler.revalidateTag(["cms:articles"]);
    expect(await handler.get("/en", pageGet)).toBeNull();
    // Rendered again later: fresh.
    vi.setSystemTime(1_010_000);
    await handler.set("/en", page("cms:articles"), pageSet);
    expect(await handler.get("/en", pageGet)).not.toBeNull();
  });

  it("treats a mark within the clock skew of the write as after it", async () => {
    const handler = new CacheHandler(ctx());
    await handler.set("/en", page("t"), pageSet);
    await invalidateTags(["t"], 1_000_000 - 500);
    expect(await handler.get("/en", pageGet)).toBeNull();
  });

  it("checks a fetch's own and implicit tags, and those revalidated in this request", async () => {
    await new CacheHandler(ctx()).set("k", fetchValue, {
      fetchCache: true,
      tags: ["assets"],
      revalidate: 60,
    } as unknown as SetCtx);
    const get = { kind: "FETCH", tags: ["assets"], softTags: ["_N_T_/en"] } as unknown as GetCtx;
    expect(await new CacheHandler(ctx()).get("k", get)).not.toBeNull();
    expect(await new CacheHandler(ctx(["assets"])).get("k", get)).toBeNull();
    vi.setSystemTime(1_005_000);
    await invalidateTags(["_N_T_/en"]);
    expect(await new CacheHandler(ctx()).get("k", get)).toBeNull();
  });

  it("deletes on a null write", async () => {
    const handler = new CacheHandler(ctx());
    await handler.set("/en", page(""), pageSet);
    await handler.set("/en", null, pageSet);
    expect(await handler.get("/en", pageGet)).toBeNull();
  });

  it("misses and drops writes while the store fails, and fails revalidation loudly", async () => {
    const failing: CacheStore = {
      available: true,
      get: () => Promise.reject(new Error("down")),
      set: () => Promise.reject(new Error("down")),
      delete: () => Promise.reject(new Error("down")),
      tagTimes: () => Promise.reject(new Error("down")),
      markTags: () => Promise.reject(new Error("down")),
    };
    const cache = sharedCache();
    (cache as { store: CacheStore }).store = failing;
    const handler = new CacheHandler(ctx());
    await expect(handler.set("/en", page(""), pageSet)).resolves.toBeUndefined();
    await expect(handler.get("/en", pageGet)).resolves.toBeNull();
    await expect(handler.revalidateTag("t")).rejects.toThrow("down");
    await expect(invalidateTags(["t"])).rejects.toThrow("down");
  });

  it("does not wait on a store that is not connected", async () => {
    const get = vi.fn();
    const cache = sharedCache();
    (cache as { store: CacheStore }).store = { available: false, get } as unknown as CacheStore;
    expect(await new CacheHandler(ctx()).get("/en", pageGet)).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("keys entries by build", () => {
    expect(sharedCache(undefined, { CACHE_BUILD_ID: "b1" }).entryPrefix).toBe("crypto-blog:b1:");
  });
});

describe("entry lifetime in the store", () => {
  const max = 7 * 86_400;
  it("follows expire, else 24 revalidation periods, between a minute and the maximum", () => {
    expect(
      ttlOf({ cacheControl: { revalidate: 30, expire: 3600 } } as unknown as SetCtx, max),
    ).toBe(3600);
    expect(ttlOf({ cacheControl: { revalidate: 300 } } as unknown as SetCtx, max)).toBe(7200);
    expect(ttlOf({ revalidate: 1 } as unknown as SetCtx, max)).toBe(60);
    expect(ttlOf({ revalidate: false } as unknown as SetCtx, max)).toBe(max);
    expect(ttlOf({ cacheControl: { revalidate: 31_536_000 } } as unknown as SetCtx, max)).toBe(max);
  });
});
