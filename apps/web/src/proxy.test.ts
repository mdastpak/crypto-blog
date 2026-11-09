import { NextRequest } from "next/server";

async function load(env: Record<string, string>) {
  vi.resetModules();
  process.env = {
    ...saved,
    BACKEND_API_URL: "http://api/api/v1",
    PUBLIC_SITE_URL: "http://blog",
    ...env,
  };
  return (await import("./proxy")).proxy;
}

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, "http://blog.example"), { headers });
}

describe("proxy", () => {
  it("redirects a path without a locale to the default", async () => {
    const proxy = await load({});
    const response = proxy(request("/coins?page=2"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://blog.example/fa/coins?page=2");
    expect(response.headers.get("vary")).toBe("Accept-Language, Cookie");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("uses the cookie, then Accept-Language", async () => {
    const proxy = await load({});
    expect(proxy(request("/", { cookie: "locale=en" })).headers.get("location")).toBe(
      "http://blog.example/en",
    );
    expect(proxy(request("/", { "accept-language": "en-GB" })).headers.get("location")).toBe(
      "http://blog.example/en",
    );
  });

  it("defaults to English in an international release", async () => {
    const proxy = await load({ DEPLOYMENT_REGION: "international" });
    expect(proxy(request("/")).headers.get("location")).toBe("http://blog.example/en");
  });

  it("never redirects to a locale the release does not serve", async () => {
    const proxy = await load({ LOCALES: "fa" });
    expect(proxy(request("/", { cookie: "locale=en" })).headers.get("location")).toBe(
      "http://blog.example/fa",
    );
  });

  it("lets localized paths through", async () => {
    const proxy = await load({});
    const response = proxy(request("/en/coins"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
