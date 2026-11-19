import { describe, expect, it, vi } from "vitest";
import type { LookupFn } from "./egress.ts";
import { PoliteHttp, type FetchFn } from "./http.ts";

/** Every name is public, except the ones listed. */
function fakeLookup(names: Record<string, string> = {}): LookupFn {
  return async (host) => [{ address: names[host] ?? "93.184.215.14", family: 4 }];
}

function http(
  routes: Record<string, () => Response>,
  extra: Partial<ConstructorParameters<typeof PoliteHttp>[0]> = {},
) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchMock: FetchFn = async (url, init) => {
    expect(init.redirect).toBe("manual");
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
    lookup: fakeLookup(),
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

const redirect =
  (location: string, status = 302) =>
  () =>
    new Response(null, { status, headers: { location } });

describe("redirects and egress", () => {
  it("follows a redirect to a public host, and reads its robots.txt too", async () => {
    const { client, calls } = http({
      "https://a.example/feed": redirect("https://cdn.example/feed.xml"),
      "https://cdn.example/feed.xml": () => new Response("<rss/>"),
    });
    expect(await client.fetchFeed("https://a.example/feed")).toMatchObject({
      kind: "ok",
      finalUrl: "https://cdn.example/feed.xml",
      movedTo: undefined,
    });
    expect(calls.map((c) => c.url)).toEqual([
      "https://a.example/robots.txt",
      "https://a.example/feed",
      "https://cdn.example/robots.txt",
      "https://cdn.example/feed.xml",
    ]);
  });

  it.each([
    ["loopback", "127.0.0.1"],
    ["RFC 1918", "10.1.2.3"],
    ["RFC 1918", "192.168.1.10"],
    ["link-local metadata", "169.254.169.254"],
    ["CGNAT", "100.64.0.1"],
    ["unique local IPv6", "fd00::1"],
    ["IPv4-mapped loopback", "::ffff:127.0.0.1"],
  ])("refuses a redirect to a %s address (%s)", async (_, address) => {
    const { client, calls } = http(
      { "https://a.example/feed": redirect("https://internal.example/admin") },
      { lookup: fakeLookup({ "internal.example": address }) },
    );
    const outcome = await client.fetchFeed("https://a.example/feed");
    expect(outcome).toMatchObject({
      kind: "error",
      reason: expect.stringContaining("non-public address"),
    });
    expect(calls.some((c) => c.url.includes("internal.example"))).toBe(false);
  });

  it("refuses a redirect to an IP literal of the metadata endpoint", async () => {
    const { client, calls } = http({
      "https://a.example/feed": redirect("http://169.254.169.254/latest/meta-data/"),
    });
    // Over http too; the scheme is refused first.
    expect(await client.fetchFeed("https://a.example/feed")).toMatchObject({ kind: "error" });
    const { client: plain } = http({
      "http://a.example/feed": redirect("http://169.254.169.254/latest/meta-data/"),
    });
    expect(await plain.fetchFeed("http://a.example/feed")).toMatchObject({
      kind: "error",
      reason: expect.stringContaining("169.254.169.254"),
    });
    expect(calls.some((c) => c.url.includes("169.254"))).toBe(false);
  });

  it("refuses a redirect from https to http", async () => {
    const { client, calls } = http({
      "https://a.example/feed": redirect("http://a.example/feed"),
    });
    expect(await client.fetchFeed("https://a.example/feed")).toMatchObject({
      kind: "error",
      reason: expect.stringContaining("https to http"),
    });
    expect(calls.map((c) => c.url)).not.toContain("http://a.example/feed");
  });

  it("does not fetch a redirect target its own robots.txt disallows", async () => {
    const { client, calls } = http({
      "https://a.example/feed": redirect("https://b.example/private/feed"),
      "https://b.example/robots.txt": () => new Response("User-agent: *\nDisallow: /private"),
    });
    expect(await client.fetchFeed("https://a.example/feed")).toMatchObject({
      kind: "blocked",
      reason: expect.stringContaining("robots.txt"),
    });
    expect(calls.map((c) => c.url)).not.toContain("https://b.example/private/feed");
  });

  it("follows at most 3 redirects", async () => {
    const routes = {
      "https://a.example/0": redirect("/1"),
      "https://a.example/1": redirect("/2"),
      "https://a.example/2": redirect("/3"),
      "https://a.example/3": () => new Response("<rss/>"),
    };
    expect((await http(routes).client.fetchFeed("https://a.example/0")).kind).toBe("ok");
    const { client, calls } = http({
      ...routes,
      "https://a.example/3": redirect("/4"),
      "https://a.example/4": () => new Response("<rss/>"),
    });
    expect(await client.fetchFeed("https://a.example/0")).toMatchObject({
      kind: "error",
      reason: "more than 3 redirects",
    });
    expect(calls.map((c) => c.url)).not.toContain("https://a.example/4");
  });

  it("reports where a feed moved for good: the permanent redirects at the start", async () => {
    const { client } = http({
      "https://a.example/feed": redirect("https://a.example/rss", 301),
      "https://a.example/rss": redirect("https://b.example/rss", 308),
      "https://b.example/rss": redirect("https://b.example/rss?today", 302),
      "https://b.example/rss?today": () => new Response(null, { status: 304 }),
    });
    expect(await client.fetchFeed("https://a.example/feed")).toEqual({
      kind: "not_modified",
      movedTo: "https://b.example/rss",
    });
  });

  it("refuses a first URL on a private host", async () => {
    const { client, calls } = http({}, { lookup: fakeLookup({ "a.example": "10.0.0.5" }) });
    expect(await client.fetchFeed("https://a.example/feed")).toMatchObject({ kind: "error" });
    expect(calls).toEqual([]);
  });

  it("reaches a private host when allowed, for tests", async () => {
    const { client } = http(
      { "http://localhost:8080/feed": () => new Response("<rss/>") },
      { lookup: fakeLookup({ localhost: "127.0.0.1" }), allowPrivate: true },
    );
    expect((await client.fetchFeed("http://localhost:8080/feed")).kind).toBe("ok");
  });
});
