import { NextRequest } from "next/server";

const saved = { ...process.env };

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("crypto-blog.sites-client")];
  process.env = {
    ...saved,
    BACKEND_API_URL: "http://api/api/v1",
    PUBLIC_SITE_URL: "http://blog",
    SITE_DETECTION: "false",
    ...env,
  };
  return (await import("./proxy")).proxy;
}

afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, "https://blog.example.com"), { headers });
}

function siteAnswer(info: unknown) {
  const mock = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ status: 200, info }), { status: 200 }),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

const SITES = [
  { id: "ir", domain: "example.ir", url: "https://example.ir", locales: ["fa", "en"] },
  { id: "global", domain: "blog.example.com", url: "https://blog.example.com", locales: ["en"] },
];

describe("locale redirect", () => {
  it("redirects a path without a locale to the default", async () => {
    const proxy = await load();
    const response = await proxy(request("/coins?page=2"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://blog.example.com/fa/coins?page=2");
    expect(response.headers.get("vary")).toBe("Accept-Language, Cookie");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("uses lang, then the cookie, then Accept-Language", async () => {
    const proxy = await load();
    const location = async (path: string, headers?: Record<string, string>) =>
      (await proxy(request(path, headers))).headers.get("location");
    expect(await location("/markets?lang=en&x=1", { cookie: "locale=fa" })).toBe(
      "https://blog.example.com/en/markets?x=1",
    );
    expect(await location("/", { cookie: "locale=en" })).toBe("https://blog.example.com/en");
    expect(await location("/", { "accept-language": "en-GB" })).toBe("https://blog.example.com/en");
  });

  it("defaults to English in an international release", async () => {
    const proxy = await load({ DEPLOYMENT_REGION: "international" });
    expect((await proxy(request("/"))).headers.get("location")).toBe("https://blog.example.com/en");
  });

  it("never redirects to a locale the release does not serve", async () => {
    const proxy = await load({ LOCALES: "fa" });
    expect((await proxy(request("/", { cookie: "locale=en" }))).headers.get("location")).toBe(
      "https://blog.example.com/fa",
    );
  });

  it("lets localized paths through", async () => {
    const proxy = await load();
    const response = await proxy(request("/en/coins"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("country sites", () => {
  it("redirects to the visitor's site on the first view, forwarding only what the backend needs", async () => {
    const fetchMock = siteAnswer({
      reason: "country",
      redirect: { needed: true, url: "https://example.ir/fa/coins" },
      sites: SITES,
    });
    const proxy = await load({ SITE_DETECTION: "true" });
    const response = await proxy(
      request("/fa/coins", {
        cookie: "locale=fa; session=secret; site=ir",
        "accept-language": "fa-IR",
        "user-agent": "Mozilla/5.0",
        "x-forwarded-for": "203.0.113.9",
      }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.ir/fa/coins");
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe("http://api/api/v1/public/site?path=%2Fcoins");
    expect(init.headers).toMatchObject({
      Origin: "https://blog.example.com",
      Cookie: "site=ir; locale=fa",
      "Accept-Language": "fa-IR",
      "User-Agent": "Mozilla/5.0",
      "X-Locale": "fa",
    });
    // Untrusted address headers are not passed on.
    expect(init.headers).not.toHaveProperty("X-Forwarded-For");
  });

  it("forwards the address chain and host only behind a trusted proxy", async () => {
    const fetchMock = siteAnswer({ redirect: { needed: false }, sites: SITES });
    const proxy = await load({ SITE_DETECTION: "true", TRUST_PROXY_HEADERS: "true" });
    await proxy(
      request("/en", {
        "x-forwarded-for": "203.0.113.9, 10.0.0.1",
        "x-forwarded-host": "example.ir",
        "x-forwarded-proto": "https",
      }),
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers["X-Forwarded-For"]).toBe("203.0.113.9, 10.0.0.1");
    expect(init.headers.Origin).toBe("https://example.ir");
  });

  it("stays and marks the visit when the visitor is on their site", async () => {
    siteAnswer({ redirect: { needed: false }, locale: { code: "en", dir: "ltr" }, sites: SITES });
    const proxy = await load({ SITE_DETECTION: "true" });
    const response = await proxy(request("/markets"));
    // The backend's locale for the site wins over the release default.
    expect(response.headers.get("location")).toBe("https://blog.example.com/en/markets");
    expect(response.cookies.get("site_checked")?.value).toBe("1");
  });

  it("asks only once per visit, and never for crawlers", async () => {
    const fetchMock = siteAnswer({ redirect: { needed: false } });
    const proxy = await load({ SITE_DETECTION: "true" });
    await proxy(request("/en", { cookie: "site_checked=1" }));
    await proxy(request("/en", { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a redirect to a domain that is not a site", async () => {
    siteAnswer({ redirect: { needed: true, url: "https://evil.example/" }, sites: SITES });
    const proxy = await load({ SITE_DETECTION: "true" });
    const response = await proxy(request("/en"));
    expect(response.status).not.toBe(302);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("serves the page here when the backend cannot answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const proxy = await load({ SITE_DETECTION: "true" });
    const response = await proxy(request("/en/coins"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(warn).toHaveBeenCalledOnce();
    // Still marked, so a down backend is not asked on every page of the visit.
    expect(response.cookies.get("site_checked")?.value).toBe("1");
  });
});

describe("removed coins", () => {
  it("answers 410 for a coin the catalog marks removed, in the page's locale", async () => {
    const proxy = await load();
    const { CatalogCopy, catalogCopy } = await import("@/lib/seo/catalog");
    const key = Symbol.for("crypto-blog.catalog-copy");
    delete (globalThis as Record<symbol, unknown>)[key];
    const copy = catalogCopy(
      () =>
        new CatalogCopy(async () => ({
          items: [
            { slug: "terra-classic", updated_at: "2026-11-09T10:00:00Z", removed: true },
            { slug: "bitcoin", updated_at: "2026-11-09T10:00:00Z" },
          ],
          has_more: false,
        })),
    )!;
    await copy.sync();
    try {
      const response = await proxy(request("/en/coins/terra-classic"));
      expect(response.status).toBe(410);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(await response.text()).toContain('lang="en"');
      expect((await proxy(request("/en/coins/bitcoin"))).status).not.toBe(410);
      expect((await proxy(request("/en/coins/terra-classic/extra"))).status).not.toBe(410);
    } finally {
      delete (globalThis as Record<symbol, unknown>)[key];
    }
  });
});
