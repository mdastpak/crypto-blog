import { describe, expect, it } from "vitest";
import { parseFeed } from "./feed.ts";
import { fixture } from "./fixtures.ts";

describe("feeds", () => {
  it("reads RSS 2.0 with CDATA, content, authors, and images", () => {
    const feed = parseFeed(fixture("example-news.rss.xml"));
    expect(feed.format).toBe("rss");
    expect(feed.entries).toHaveLength(4);
    expect(feed.entries[0]).toMatchObject({
      title: "Bitcoin Tops $70,000 as ETF Inflows Surge",
      guid: "ex-1001",
      author: "Jane Reporter",
      image: "https://cdn.news.example.com/img/btc.jpg",
      published: "Mon, 09 Nov 2026 08:30:00 +0000",
    });
    expect(feed.entries[0]!.content).toContain("Full article text");
    expect(feed.entries[1]!.image).toBe("https://cdn.news.example.com/img/sol.png");
  });

  it("reads Atom, preferring the alternate link and the published time", () => {
    const feed = parseFeed(fixture("second-source.atom.xml"));
    expect(feed.format).toBe("atom");
    expect(feed.entries[0]).toMatchObject({
      link: "https://another.example.org/a/bitcoin-70k",
      published: "2026-11-09T09:00:00Z",
      author: "Desk",
    });
    // No published time: the updated one.
    expect(feed.entries[1]!.published).toBe("2026-11-09T06:00:00Z");
  });

  it("ignores a DOCTYPE, so a feed cannot expand entities", () => {
    const feed = parseFeed(fixture("billion-laughs.xml"));
    expect(feed.entries[0]!.title ?? "").not.toContain("aaaaaaaaaa");
  });

  it("refuses a document that is not a feed", () => {
    expect(() => parseFeed("<html><body>hi</body></html>")).toThrow("not an RSS or Atom feed");
  });
});
