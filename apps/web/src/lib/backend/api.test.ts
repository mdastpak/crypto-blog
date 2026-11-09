import asset from "./fixtures/asset-bitcoin.json";
import feed from "./fixtures/feed-page.json";

const saved = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("crypto-blog.backend")];
  process.env = {
    ...saved,
    BACKEND_API_URL: "https://api.example.com/api/v1",
    PUBLIC_SITE_URL: "https://blog",
  };
});

afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

function stubFetch(body: unknown) {
  const mock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("marketData", () => {
  it("reads an asset with its tag and revalidation", async () => {
    const fetchMock = stubFetch(asset);
    const { marketData, REVALIDATE } = await import("./api");
    await marketData.getAsset("bit/coin");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { next: unknown }];
    expect(url).toBe("https://api.example.com/api/v1/market-data/assets/bit%2Fcoin");
    expect(init.next).toEqual({ revalidate: REVALIDATE.catalog, tags: ["asset:bit/coin"] });
  });

  it("never caches the feed", async () => {
    const fetchMock = stubFetch(feed);
    const { marketData } = await import("./api");
    const page = await marketData.feed({ updatedSince: "2026-11-09T00:00:00Z", limit: 100 });
    expect(page.items).toHaveLength(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { next: { revalidate: number } },
    ];
    expect(url).toBe(
      "https://api.example.com/api/v1/market-data/feed/assets?limit=100&updated_since=2026-11-09T00%3A00%3A00Z",
    );
    expect(init.next.revalidate).toBe(0);
  });
});
