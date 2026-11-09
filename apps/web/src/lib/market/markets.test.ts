import { describe, expect, it } from "vitest";
import type { Asset, Currency, VenueQuote } from "@/lib/backend/schemas";
import {
  assetFor,
  currencyName,
  marketPath,
  marketQuotes,
  marketsOf,
  parseMarket,
} from "./markets";
import { priceIn } from "./price";

const currency = (symbol: string, extra: Partial<Currency["info"]> = {}): Currency => ({
  hk: symbol,
  info: { symbol, en_name: `${symbol} coin`, fa_name: `ارز ${symbol}`, ...extra },
});

const venue = (venue: string, last: string, extra: Partial<VenueQuote> = {}): VenueQuote => ({
  venue,
  region: "global",
  pair: "BTCUSDT",
  quote: "USDT",
  last,
  open: "100",
  observed_at: "2026-11-09T10:00:00Z",
  stale: false,
  outlier: false,
  ...extra,
});

describe("markets", () => {
  it("drops toman quotes abroad", () => {
    expect(marketQuotes(["USDT", "IRT"], "ir")).toEqual(["USDT", "IRT"]);
    expect(marketQuotes(["USDT", "IRT"], "international")).toEqual(["USDT"]);
  });

  it("pairs every non-fiat currency with each quote but itself", () => {
    const markets = marketsOf(
      [currency("btc"), currency("USDT"), currency("IRT", { if_fiat: true })],
      ["USDT", "IRT"],
    );
    expect(markets.map((m) => `${m.base}/${m.quote}`)).toEqual(["BTC/USDT", "BTC/IRT", "USDT/IRT"]);
  });

  it("reads and writes market paths in lower case only", () => {
    expect(marketPath("BTC", "USDT")).toBe("btc-usdt");
    expect(parseMarket("btc-usdt")).toEqual({ base: "BTC", quote: "USDT" });
    expect(parseMarket("BTC-USDT")).toBeUndefined();
    expect(parseMarket("btc")).toBeUndefined();
    expect(parseMarket("btc-usdt-x")).toBeUndefined();
  });

  it("finds a currency's asset: same symbol, linked first, then best ranked", () => {
    const asset = (slug: string, symbol: string, verified: boolean, rank?: number) =>
      ({ slug, symbol, name: slug, verified, market_cap_rank: rank }) as Asset;
    const assets = [
      asset("bitcoin-copy", "BTC", false, 900),
      asset("wrapped-bitcoin", "WBTC", true, 20),
      asset("bitcoin", "BTC", false, 1),
    ];
    expect(assetFor("btc", assets)?.slug).toBe("bitcoin");
    expect(assetFor("BTC", [...assets, asset("btc-linked", "BTC", true)])?.slug).toBe("btc-linked");
    expect(assetFor("ETH", assets)).toBeUndefined();
  });

  it("names a currency in the page's language, falling back", () => {
    expect(currencyName(currency("BTC"), "fa")).toBe("ارز BTC");
    expect(currencyName(currency("BTC"), "en")).toBe("BTC coin");
    expect(currencyName(currency("BTC", { en_name: undefined }), "en")).toBe("ارز BTC");
    expect(currencyName(currency("BTC", { en_name: "", fa_name: "" }), "en")).toBe("BTC");
  });
});

describe("price in one quote", () => {
  const quotes = [
    venue("a", "100"),
    venue("b", "110"),
    venue("stale", "50", { stale: true }),
    venue("outlier", "500", { outlier: true }),
    venue("nobitex", "6500000", { region: "ir", quote: "IRT", pair: "BTCIRT", open: "6000000" }),
  ];

  it("is the median of fresh, non-outlier venues of that quote", () => {
    expect(priceIn(quotes, "usdt", "ir")).toMatchObject({ quote: "USDT", price: 105, venues: 2 });
    expect(priceIn(quotes, "IRT", "ir")).toMatchObject({ price: 6500000, venues: 1 });
  });

  it("hides Iranian venues and toman prices abroad", () => {
    expect(priceIn(quotes, "IRT", "international")).toBeUndefined();
    expect(priceIn(quotes, "USDT", "international")?.venues).toBe(2);
  });

  it("is undefined when every venue is stale or an outlier", () => {
    expect(priceIn([venue("s", "1", { stale: true })], "USDT", "ir")).toBeUndefined();
  });
});
