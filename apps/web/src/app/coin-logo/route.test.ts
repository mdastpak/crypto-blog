import { NextRequest } from "next/server";

const saved = { ...process.env };
const fetchMock = vi.fn();

async function load() {
  vi.resetModules();
  process.env = {
    ...saved,
    BACKEND_API_URL: "http://api",
    PUBLIC_SITE_URL: "http://blog",
    COIN_LOGO_HOSTS: "logos.example",
  };
  vi.stubGlobal("fetch", fetchMock);
  return (await import("./route")).GET;
}

afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const request = (u: string) => new NextRequest(`http://blog/coin-logo?u=${encodeURIComponent(u)}`);
const image = (type: string, bytes = 8, headers: Record<string, string> = {}) =>
  new Response(new Uint8Array(bytes), { headers: { "content-type": type, ...headers } });

describe("coin logo route", () => {
  it("serves a raster logo from an allowed host, without cookies, referrer, or redirects", async () => {
    const GET = await load();
    fetchMock.mockResolvedValue(image("image/png"));
    const response = await GET(request("https://logos.example/btc.png"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("max-age=86400");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://logos.example/btc.png");
    expect(init).toMatchObject({
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      next: { tags: ["coin-logo"] },
    });
  });

  it("fetches nothing from a host that is not allowed, or over http", async () => {
    const GET = await load();
    for (const u of [
      "https://evil.example/btc.png",
      "http://logos.example/btc.png",
      "https://logos.example:8443/btc.png",
      "https://user:pw@logos.example/btc.png",
      "not a url",
    ]) {
      expect((await GET(request(u))).status).toBe(404);
    }
    expect((await GET(new NextRequest("http://blog/coin-logo"))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses SVG, oversized images, and failures of the source", async () => {
    const GET = await load();
    fetchMock.mockResolvedValueOnce(image("image/svg+xml"));
    expect((await GET(request("https://logos.example/a.svg"))).status).toBe(502);
    fetchMock.mockResolvedValueOnce(image("image/png", 8, { "content-length": "9999999" }));
    expect((await GET(request("https://logos.example/a.png"))).status).toBe(502);
    fetchMock.mockResolvedValueOnce(image("image/png", 600 * 1024));
    expect((await GET(request("https://logos.example/a.png"))).status).toBe(502);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect((await GET(request("https://logos.example/a.png"))).status).toBe(404);
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await GET(request("https://logos.example/a.png"))).status).toBe(502);
  });
});
