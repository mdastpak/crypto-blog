import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig, sourceRegions } from "./config.ts";
import { parseSources } from "./sources.ts";

const valid = { DATABASE_URL: "postgres://x", NEWS_BOT_INFO_URL: "https://blog.example.com/bot" };

describe("settings", () => {
  it("reads defaults and names the bot", () => {
    const config = parseConfig({ ...valid, NEWS_HTTP_PROXY: "" });
    expect(config).toMatchObject({
      region: "ir",
      concurrency: 4,
      leaseSeconds: 120,
      httpProxy: undefined,
    });
    expect(config.userAgent).toBe("CryptoBlogNewsBot/0.1 (+https://blog.example.com/bot)");
  });

  it("reports every problem at once", () => {
    try {
      parseConfig({ DEPLOYMENT_REGION: "mars", CONCURRENCY: "0" });
      expect.unreachable();
    } catch (error) {
      expect((error as ConfigError).problems).toEqual([
        "DATABASE_URL is required",
        'DEPLOYMENT_REGION Invalid option: expected one of "ir"|"international"',
        "NEWS_BOT_INFO_URL is required",
        "CONCURRENCY Too small: expected number to be >=1",
      ]);
    }
  });

  it("collects Iranian sources only in an Iranian release", () => {
    expect(sourceRegions("ir")).toEqual(["ir", "global"]);
    expect(sourceRegions("international")).toEqual(["global"]);
  });
});

describe("sources file", () => {
  it("reads sources with defaults", () => {
    const [source] = parseSources({
      sources: [
        { id: "aa", name: "A", url: "https://a.example/feed", language: "en", region: "global" },
      ],
    });
    expect(source).toMatchObject({
      kind: "rss",
      license: "headline",
      intervalMinutes: 15,
      enabled: true,
    });
  });

  it("refuses bad values, and duplicate ids", () => {
    const source = {
      id: "aa",
      name: "A",
      url: "https://a.example/feed",
      language: "en",
      region: "global",
    };
    expect(() =>
      parseSources({ sources: [source, { ...source, id: "b/", url: "ftp://b", language: "de" }] }),
    ).toThrow(/sources\.1\.id[\s\S]*sources\.1\.url[\s\S]*sources\.1\.language/);
    expect(() => parseSources({ sources: [source, source] })).toThrow("duplicate id aa");
  });
});
