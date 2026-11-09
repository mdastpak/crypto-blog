import { describe, expect, it, vi } from "vitest";
import { createMatcher, loadCatalog } from "./coins.ts";

const matcher = createMatcher([
  { slug: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { slug: "ethereum", symbol: "ETH", name: "Ethereum" },
  { slug: "solana", symbol: "SOL", name: "Solana" },
  { slug: "cardano", symbol: "ADA", name: "Cardano" },
  { slug: "gas", symbol: "GAS", name: "Gas" },
  { slug: "one-token", symbol: "ONE", name: "Harmony" },
  { slug: "uni-a", symbol: "UNI", name: "Uniswap" },
  { slug: "uni-b", symbol: "UNI", name: "Universe Coin" },
]);

describe("coin matching", () => {
  it("matches names in any case and capital symbols", () => {
    expect(matcher.match("bitcoin tops $70k", "ETH followed")).toEqual(["bitcoin", "ethereum"]);
    expect(matcher.match("SEC delays decision on SOL fund", "")).toEqual(["solana"]);
  });

  it("does not take news acronyms or lowercase words for tickers", () => {
    expect(matcher.match("SEC and ETF news; the CEO spoke", "")).toEqual([]);
    expect(matcher.match("ada lovelace day", "sol y sombra")).toEqual([]);
  });

  it("matches an everyday-word name only next to its symbol, or as $SYMBOL", () => {
    expect(matcher.match("Gas fees fall to a yearly low", "")).toEqual([]);
    expect(matcher.match("GAS token jumps; Gas holders cheer", "")).toEqual(["gas"]);
    expect(matcher.match("$ONE rallies", "")).toEqual(["one-token"]);
    expect(matcher.match("ONE more thing", "")).toEqual([]);
  });

  it("matches a shared symbol only with the coin's name", () => {
    expect(matcher.match("UNI jumps", "")).toEqual([]);
    expect(matcher.match("UNI jumps as Uniswap fees switch on", "")).toEqual(["uni-a"]);
  });

  it("matches Persian names, with or without the half-space", () => {
    expect(matcher.match("قیمت بیت‌کوین از ۷۰ هزار دلار گذشت", "اتریوم هم بالا رفت")).toEqual([
      "bitcoin",
      "ethereum",
    ]);
    expect(matcher.match("بیتکوین", "")).toEqual(["bitcoin"]);
  });
});

describe("catalog", () => {
  it("reads the backend's pages up to the limit", async () => {
    const page = (items: unknown[], next?: string) =>
      new Response(JSON.stringify({ status: 200, info: { items, next_cursor: next } }));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page([{ slug: "bitcoin", symbol: "BTC", name: "Bitcoin", market_cap_rank: 1 }], "c1"),
      )
      .mockResolvedValueOnce(page([{ slug: "ethereum", symbol: "ETH", name: "Ethereum" }]));
    const assets = await loadCatalog("http://api/api/v1", fetchMock);
    expect(assets.map((a) => a.slug)).toEqual(["bitcoin", "ethereum"]);
    expect(String(fetchMock.mock.calls[1]![0])).toContain("cursor=c1");
  });
});
