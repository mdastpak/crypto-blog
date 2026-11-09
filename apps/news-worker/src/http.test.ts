import { describe, expect, it, vi } from "vitest";
import { PoliteHttp, type FetchFn } from "./http.ts";

function http(
  routes: Record<string, () => Response>,
  extra: Partial<ConstructorParameters<typeof PoliteHttp>[0]> = {},
) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchMock: FetchFn = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const route = routes[url];
    if (!route) return new Response("", { status: 404 });
    return route();
  };
  const client = new PoliteHttp({
    userAgent: "CryptoBlogNewsBot/0.1 (+https://blog.example.com/bot)",
    timeoutMs: 1000,
    maxBytes: 1000,
    hostMinIntervalMs: 0,
    fetch: fetchMock,
    ...extra,
  });
  return { client, calls };
}

describe("polite fetching", () => {
  it("names itself, sends validators, and reads 304 as not modified", async () => {
    const { client, calls } = http({
      "https://a.example/feed": () => new Response(null, { status: 304 }),
    });
    const outcome = await client.fetchFeed("https://a.example/feed", {
      etag: '"v1"',
      lastModified: "Mon, 09 Nov 2026 08:00:00 GMT",
    });
    expect(outcome.kind).toBe("not_modified");
    const feedCall = calls.find((c) => c.url.endsWith("/feed"))!;
    expect(feedCall.headers["User-Agent"]).toContain("CryptoBlogNewsBot");
    expect(feedCall.headers["If-None-Match"]).toBe('"v1"');
    expect(feedCall.headers["If-Modified-Since"]).toBe("Mon, 09 Nov 2026 08:00:00 GMT");
  });

  it("keeps the new validators of a fresh answer", async () => {
    const { client } = http({
      "https://a.example/feed": () =>
        new Response("<rss/>", {
          headers: { etag: '"v2"', "last-modified": "Tue, 10 Nov 2026 08:00:00 GMT" },
        }),
    });
    expect(await client.fetchFeed("https://a.example/feed")).toMatchObject({
      kind: "ok",
      body: "<rss/>",
      etag: '"v2"',
    });
  });

  it("honors robots.txt, asked once per host", async () => {
    const { client, calls } = http({
      "https://b.example/robots.txt": () => new Response("User-agent: *\nDisallow: /private"),
      "https://b.example/rss": () => new Response("<rss/>"),
    });
    expect((await client.fetchFeed("https://b.example/private/feed")).kind).toBe("blocked");
    expect((await client.fetchFeed("https://b.example/rss")).kind).toBe("ok");
    expect(calls.filter((c) => c.url.endsWith("robots.txt"))).toHaveLength(1);
  });

  it("does not fetch while the host's robots.txt fails with 5xx", async () => {
    const { client, calls } = http({
      "https://c.example/robots.txt": () => new Response("", { status: 503 }),
    });
    expect((await client.fetchFeed("https://c.example/rss")).kind).toBe("blocked");
    expect(calls.map((c) => c.url)).toEqual(["https://c.example/robots.txt"]);
  });

  it("refuses a body over the size limit, and reports Retry-After", async () => {
    const { client } = http({
      "https://d.example/big": () => new Response("x".repeat(2000)),
      "https://d.example/busy": () =>
        new Response("", { status: 429, headers: { "retry-after": "120" } }),
    });
    expect(await client.fetchFeed("https://d.example/big")).toMatchObject({
      kind: "error",
      reason: expect.stringContaining("larger"),
    });
    expect(await client.fetchFeed("https://d.example/busy")).toMatchObject({
      kind: "error",
      status: 429,
      retryAfterSeconds: 120,
    });
  });

  it("spaces requests to one host", async () => {
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    const { client } = http(
      {
        "https://e.example/a": () => new Response("<rss/>"),
        "https://e.example/b": () => new Response("<rss/>"),
      },
      { hostMinIntervalMs: 2000, now: () => clock, sleep },
    );
    await client.fetchFeed("https://e.example/a");
    await client.fetchFeed("https://e.example/b");
    // robots.txt, then a, then b: two waits of 2 s.
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 2000]);
  });
});
