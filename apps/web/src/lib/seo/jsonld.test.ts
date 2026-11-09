import { describe, expect, it } from "vitest";
import { article, breadcrumbList, coinThing, serializeJsonLd } from "./jsonld";

describe("JSON-LD", () => {
  it("cannot close its script tag", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>\u2028" });
    expect(out).not.toContain("</script");
    expect(out).toContain("\\u003c/script");
    expect(out).toContain("\\u2028");
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script>\u2028" });
  });

  it("makes breadcrumb links absolute, the last one the page itself", () => {
    expect(
      breadcrumbList(
        "https://b.example",
        [{ label: "Home", href: "/en" }, { label: "BTC" }],
        "/en/coins/btc",
      ),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://b.example/en" },
        { "@type": "ListItem", position: 2, name: "BTC", item: "https://b.example/en/coins/btc" },
      ],
    });
  });

  it("uses the catalog's Thing for a coin and adds the page URL", () => {
    const fromFeed = coinThing(
      { "@type": "Thing", name: "Bitcoin", sameAs: ["https://bitcoin.org"] },
      { name: "x", symbol: "x" },
      "https://b.example/en/coins/bitcoin",
    );
    expect(fromFeed).toEqual({
      "@context": "https://schema.org",
      "@type": "Thing",
      name: "Bitcoin",
      sameAs: ["https://bitcoin.org"],
      url: "https://b.example/en/coins/bitcoin",
    });
    expect(coinThing(undefined, { name: "Bitcoin", symbol: "BTC" }, "u")).toMatchObject({
      "@type": "Thing",
      name: "Bitcoin",
      alternateName: "BTC",
      url: "u",
    });
  });

  it("describes news with its sources, and generated news with no person as author", () => {
    const common = {
      headline: "h".repeat(200),
      url: "https://b.example/en/blog/x",
      locale: "en",
      publishedAt: "2026-11-09T10:00:00Z",
      updatedAt: null,
      author: { name: "Sara", url: "https://b.example/en/blog/authors/sara" },
      publisher: { name: "Crypto Blog", url: "https://b.example", logo: "/logo.svg" },
      sources: [{ name: "Wire", url: "https://wire.example/a" }],
    };
    const news = article({ ...common, news: true, generated: true });
    expect(news).toMatchObject({
      "@type": "NewsArticle",
      datePublished: "2026-11-09T10:00:00Z",
      dateModified: "2026-11-09T10:00:00Z",
      author: { "@type": "Organization", name: "Crypto Blog" },
      publisher: { logo: { url: "https://b.example/logo.svg" } },
      citation: [{ "@type": "CreativeWork", name: "Wire", url: "https://wire.example/a" }],
    });
    expect((news.headline as string).length).toBe(110);
    expect(article({ ...common, news: false, generated: false, sources: [] })).toMatchObject({
      "@type": "Article",
      author: { "@type": "Person", name: "Sara" },
    });
  });
});
