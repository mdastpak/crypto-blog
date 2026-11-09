import { CircuitBreaker } from "./breaker";
import { BackendClient, paginate } from "./client";
import { BackendError } from "./errors";
import asset from "./fixtures/asset-bitcoin.json";
import feed from "./fixtures/feed-page.json";
import { assetSchema, feedPageSchema } from "./schemas";

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function client(
  fetchMock: typeof fetch,
  extra: Partial<ConstructorParameters<typeof BackendClient>[0]> = {},
) {
  return new BackendClient({
    baseUrl: "https://api.example.com/api/v1/",
    timeoutMs: 1000,
    fetch: fetchMock,
    sleep: async () => {},
    random: () => 0.5,
    ...extra,
  });
}

describe("BackendClient", () => {
  it("uses the global fetch of each call, not the one at its creation", async () => {
    const made = new BackendClient({ baseUrl: "https://api.example.com", timeoutMs: 1000 });
    const later = vi.fn<typeof fetch>(async () => json(asset));
    vi.stubGlobal("fetch", later);
    try {
      await made.get("/market-data/assets/bitcoin", assetSchema);
      expect(later).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("unwraps and validates the envelope, dropping unknown fields", async () => {
    const fetchMock = vi.fn(async () => json(asset));
    const result = await client(fetchMock).get("/market-data/assets/bitcoin", assetSchema);
    expect(result.slug).toBe("bitcoin");
    expect(result.circulating_supply).toBe("19780000");
    expect(result).not.toHaveProperty("some_future_field");
  });

  it("parses feed pages with tombstones", async () => {
    const result = await client(vi.fn(async () => json(feed))).get("/feed", feedPageSchema);
    expect(result.items.map((i) => [i.slug, i.removed ?? false])).toEqual([
      ["bitcoin", false],
      ["terra-luna", true],
    ]);
    expect(result.next_cursor).toBe("c2");
  });

  it("builds the URL, skipping empty query values, and passes locale and request id", async () => {
    const fetchMock = vi.fn(async () => json(asset));
    await client(fetchMock).get("/market-data/assets/bitcoin", assetSchema, {
      query: { q: "bit coin", limit: 10, cursor: undefined, empty: "" },
      locale: "fa",
      requestId: "req-1",
      revalidate: 60,
      tags: ["asset:bitcoin"],
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { next: unknown },
    ];
    expect(url).toBe(
      "https://api.example.com/api/v1/market-data/assets/bitcoin?q=bit+coin&limit=10",
    );
    expect(init.headers).toMatchObject({
      "Accept-Language": "fa",
      "X-Locale": "fa",
      "X-Request-ID": "req-1",
    });
    expect(init.next).toEqual({ revalidate: 60, tags: ["asset:bitcoin"] });
  });

  it("maps an error envelope to a BackendError and does not retry a 404", async () => {
    const fetchMock = vi.fn(async () =>
      json(
        { status: 404, message: "Not found", code: "not_found", request_id: "r1" },
        { status: 404 },
      ),
    );
    const error = await client(fetchMock)
      .get("/x", assetSchema)
      .catch((e) => e);
    expect(error).toBeInstanceOf(BackendError);
    expect(error).toMatchObject({
      code: "not_found",
      status: 404,
      requestId: "r1",
      notFound: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json(
          { status: 503, code: "database_busy" },
          { status: 503, headers: { "retry-after": "1" } },
        ),
      )
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json(asset));
    const sleep = vi.fn(async () => {});
    const result = await client(fetchMock, { sleep }).get("/x", assetSchema);
    expect(result.slug).toBe("bitcoin");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Retry-After 1 second, then jittered backoff of the second attempt.
    expect(sleep.mock.calls).toEqual([[1000], [200]]);
  });

  it("gives up after the retries", async () => {
    const fetchMock = vi.fn(async () => json({ status: 502 }, { status: 502 }));
    const error = await client(fetchMock, { retries: 2 })
      .get("/x", assetSchema)
      .catch((e) => e);
    expect(error).toMatchObject({ status: 502, code: "error" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports a timeout", async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const error = await client(fetchMock, { retries: 0 })
      .get("/x", assetSchema)
      .catch((e) => e);
    expect(error).toMatchObject({ code: "timeout", status: 0 });
  });

  it("rejects an answer that does not match the schema", async () => {
    const fetchMock = vi.fn(async () => json({ status: 200, info: { slug: "x" } }));
    const error = await client(fetchMock)
      .get("/x", assetSchema)
      .catch((e) => e);
    expect(error.code).toBe("invalid_response");
    expect(error.message).toMatch(/symbol/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a decimal that is not a decimal string", async () => {
    const bad = { ...asset, info: { ...asset.info, max_supply: 21000000 } };
    const error = await client(vi.fn(async () => json(bad)))
      .get("/x", assetSchema)
      .catch((e) => e);
    expect(error.code).toBe("invalid_response");
  });

  it("fails fast while the circuit is open", async () => {
    let now = 0;
    const breaker = new CircuitBreaker(2, 1000, () => now);
    const fetchMock = vi.fn(async () => json({ status: 503 }, { status: 503 }));
    const c = client(fetchMock, { breaker, retries: 0 });
    await c.get("/x", assetSchema).catch(() => {});
    await c.get("/x", assetSchema).catch(() => {});
    expect(breaker.state).toBe("open");
    const error = await c.get("/x", assetSchema).catch((e) => e);
    expect(error.code).toBe("circuit_open");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    now = 1000;
    fetchMock.mockResolvedValueOnce(json(asset));
    await expect(c.get("/x", assetSchema)).resolves.toMatchObject({ slug: "bitcoin" });
    expect(breaker.state).toBe("closed");
  });
});

describe("CircuitBreaker", () => {
  it("lets one probe through when half-open, and reopens on its failure", () => {
    let now = 0;
    const breaker = new CircuitBreaker(1, 100, () => now);
    breaker.failure();
    expect(breaker.allow()).toBe(false);
    now = 100;
    expect(breaker.allow()).toBe(true);
    expect(breaker.allow()).toBe(false);
    breaker.failure();
    expect(breaker.state).toBe("open");
  });

  it("does not open on a 4xx answer", async () => {
    const breaker = new CircuitBreaker(1, 100);
    const fetchMock = vi.fn(async () => json({ status: 404 }, { status: 404 }));
    await client(fetchMock, { breaker })
      .get("/x", assetSchema)
      .catch(() => {});
    expect(breaker.state).toBe("closed");
  });
});

describe("paginate", () => {
  it("follows cursors to the last page", async () => {
    const pages: Record<string, { items: number[]; next_cursor?: string }> = {
      start: { items: [1, 2], next_cursor: "a" },
      a: { items: [3], next_cursor: "b" },
      b: { items: [4] },
    };
    const seen: number[][] = [];
    for await (const items of paginate(async (cursor) => pages[cursor ?? "start"]!))
      seen.push(items);
    expect(seen).toEqual([[1, 2], [3], [4]]);
  });

  it("stops at maxPages and on a repeated cursor", async () => {
    const fetchPage = vi.fn(async () => ({ items: [1], next_cursor: "same" }));
    const seen: number[][] = [];
    for await (const items of paginate(fetchPage, 5)) seen.push(items);
    expect(seen).toHaveLength(2);
  });
});
