import { describe, expect, it } from "vitest";
import { parseFeed } from "./feed.ts";
import { fixture } from "./fixtures.ts";
import {
  canonicalUrl,
  cleanText,
  contentHash,
  detectLanguage,
  normalizeEntry,
  publishedTime,
  titleTokens,
} from "./normalize.ts";

const now = new Date("2026-11-09T12:00:00Z");

describe("canonical URLs", () => {
  it("drops tracking parameters, fragments, www, default ports, and trailing slashes", () => {
    expect(
      canonicalUrl("https://WWW.News.example.com:443/a/b/?utm_source=rss&id=2&fbclid=x&b=1#top"),
    ).toBe("https://news.example.com/a/b?b=1&id=2");
    expect(canonicalUrl("/relative/path/", "https://news.example.com/feed")).toBe(
      "https://news.example.com/relative/path",
    );
    expect(canonicalUrl("javascript:alert(1)")).toBeUndefined();
    expect(canonicalUrl("not a url")).toBeUndefined();
  });
});

describe("text", () => {
  it("strips tags, scripts, and entities", () => {
    expect(cleanText("<p>BTC <b>rose</b>&nbsp;4%</p><script>alert(1)</script> &amp; &#x41;")).toBe(
      "BTC rose 4% & A",
    );
  });

  it("detects Persian by script, else keeps the source's language", () => {
    expect(detectLanguage("قیمت بیت‌کوین از ۷۰ هزار دلار گذشت", "en")).toBe("fa");
    expect(detectLanguage("Bitcoin tops $70,000", "fa")).toBe("en");
    expect(detectLanguage("BTC", "fa")).toBe("fa");
  });

  it("keeps a valid time, and replaces a missing, bad, or far future one with now", () => {
    expect(publishedTime("Mon, 09 Nov 2026 10:00:00 +0330", now).toISOString()).toBe(
      "2026-11-09T06:30:00.000Z",
    );
    expect(publishedTime("not a date", now)).toEqual(now);
    expect(publishedTime(undefined, now)).toEqual(now);
    expect(publishedTime("2026-11-10T12:00:00Z", now)).toEqual(now);
  });

  it("compares Persian letter variants and digits as equal", () => {
    expect(titleTokens("قيمت بيت‌كوين ۷۰")).toEqual(titleTokens("قیمت بیت‌کوین 70"));
    expect(contentHash("قيمت", "")).toBe(contentHash("قیمت", ""));
  });
});

describe("entries", () => {
  const [first, second, blank, badDate] = parseFeed(fixture("example-news.rss.xml")).entries;
  const options = {
    language: "en" as const,
    license: "headline" as const,
    feedUrl: "https://news.example.com/feed",
    now,
  };

  it("keeps the headline, a short clean summary, the link, and metadata", () => {
    const item = normalizeEntry(first!, options)!;
    expect(item).toMatchObject({
      title: "Bitcoin Tops $70,000 as ETF Inflows Surge",
      canonicalUrl: "https://news.example.com/markets/2026/11/09/bitcoin-tops-70000",
      imageUrl: "https://cdn.news.example.com/img/btc.jpg",
      author: "Jane Reporter",
      language: "en",
    });
    expect(item.summary).toBe(
      "BTC rose 4% on Monday as spot ETF inflows hit a record. Ethereum (ETH) followed.",
    );
    // A headline license keeps no text.
    expect(item.content).toBeUndefined();
    expect(item.publishedAt.toISOString()).toBe("2026-11-09T08:30:00.000Z");
  });

  it("keeps the text only with a full license", () => {
    expect(normalizeEntry(first!, { ...options, license: "full" })!.content).toBe(
      "Full article text that only a full license may keep.",
    );
  });

  it("writes Persian with Persian letters", () => {
    const [entry] = parseFeed(fixture("persian.rss.xml")).entries;
    const item = normalizeEntry(entry!, { ...options, language: "fa" })!;
    expect(item.title).toBe("قیمت بیت‌کوین از ۷۰ هزار دلار گذشت");
    expect(item.language).toBe("fa");
    expect(item.canonicalUrl).toBe("https://fa.example.ir/news/1234");
  });

  it("skips an entry without a title, and dates a bad time as now", () => {
    expect(normalizeEntry(blank!, options)).toBeUndefined();
    expect(normalizeEntry(badDate!, options)!.publishedAt).toEqual(now);
    expect(normalizeEntry(second!, options)!.canonicalUrl).toBe(
      "https://news.example.com/policy/sec-delays-solana-etf",
    );
  });
});
