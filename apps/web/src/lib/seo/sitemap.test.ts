import { describe, expect, it } from "vitest";
import { chunks, newsUrlset, parseSitemapName, sitemapIndex, urlset } from "./sitemap";

describe("sitemaps", () => {
  it("writes URLs with lastmod and escaped hreflang links", () => {
    const xml = urlset([
      {
        loc: "https://b.example/en/blog/a&b",
        lastmod: "2026-11-09T10:00:00Z",
        alternates: { en: "https://b.example/en/blog/a&b", "x-default": "https://b.example/fa/x" },
      },
      { loc: "https://b.example/en", lastmod: "not a date" },
    ]);
    expect(xml).toContain("<loc>https://b.example/en/blog/a&amp;b</loc>");
    expect(xml).toContain("<lastmod>2026-11-09T10:00:00.000Z</lastmod>");
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://b.example/fa/x"/>',
    );
    expect(xml).toContain("<url><loc>https://b.example/en</loc></url>");
  });

  it("writes an index and a news sitemap", () => {
    expect(sitemapIndex([{ loc: "https://b.example/sitemaps/pages-fa.xml" }])).toContain(
      "<sitemap><loc>https://b.example/sitemaps/pages-fa.xml</loc></sitemap>",
    );
    const news = newsUrlset([
      {
        loc: "https://b.example/fa/blog/x",
        title: "بیت‌کوین <بالا>",
        language: "fa",
        publishedAt: "2026-11-09T10:00:00Z",
        publication: "کریپتو بلاگ",
      },
    ]);
    expect(news).toContain("<news:title>بیت‌کوین &lt;بالا&gt;</news:title>");
    expect(news).toContain(
      "<news:publication_date>2026-11-09T10:00:00.000Z</news:publication_date>",
    );
  });

  it("names its files", () => {
    expect(parseSitemapName("coins-en-3.xml")).toEqual({ kind: "coins", locale: "en", part: 3 });
    expect(parseSitemapName("articles-fa.xml")).toEqual({ kind: "articles", locale: "fa" });
    expect(parseSitemapName("news.xml")).toEqual({ kind: "news" });
    expect(parseSitemapName("coins-en.xml")).toBeUndefined();
    expect(parseSitemapName("../etc.xml")).toBeUndefined();
  });

  it("splits a long list", () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks([], 2)).toEqual([]);
  });
});
