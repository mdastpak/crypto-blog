// A stand-in for the exchange backend in end-to-end tests: fixed answers for
// the routes the pages read, so the tests need no network or real backend.
import { createServer } from "node:http";
import { handleCms } from "./mock-cms.mjs";

const port = Number(process.env.MOCK_BACKEND_PORT ?? 3199);
const now = "2026-11-09T10:00:00Z";

const bitcoin = {
  slug: "bitcoin",
  symbol: "BTC",
  name: "Bitcoin",
  kind: "coin",
  description: "The first decentralized cryptocurrency.",
  links: { homepage: "https://bitcoin.org" },
  // On an allowed host (COIN_LOGO_HOSTS in playwright.config.ts) that does not resolve.
  logo_url: "https://logos.test/btc.png",
  market_cap_rank: 1,
  circulating_supply: "19780000",
  max_supply: "21000000",
  contracts: [],
  attribution: "Data provided by CoinGecko",
  verified: false,
  label: "unverified",
  updated_at: now,
};
const ether = {
  ...bitcoin,
  slug: "ethereum",
  symbol: "ETH",
  name: "Ethereum",
  // On a host that is not allowed: shown as a letter.
  logo_url: "https://elsewhere.test/eth.png",
  market_cap_rank: 2,
  max_supply: undefined,
};

const quote = (venue, last, extra = {}) => ({
  venue,
  venue_name: venue[0].toUpperCase() + venue.slice(1),
  region: "global",
  pair: "BTCUSDT",
  quote: "USDT",
  last,
  open: "62000",
  median: "64000",
  volume_quote: "1000000",
  observed_at: now,
  stale: false,
  outlier: false,
  ...extra,
});

const currency = (symbol, en, fa) => ({
  hk: `hk-${symbol.toLowerCase()}`,
  status: "approved",
  info: { symbol, en_name: en, fa_name: fa, is_token: false, if_fiat: false },
  updated_at: now,
});

const routes = {
  "/api/v1/market-data/assets": () => ({ items: [bitcoin, ether] }),
  "/api/v1/market-data/assets/bitcoin": () => bitcoin,
  "/api/v1/market-data/assets/ethereum": () => ether,
  "/api/v1/market-data/assets/bitcoin/venues": () => ({
    asset: "bitcoin",
    verified: false,
    quotes: [
      quote("binance", "64000", { volume_quote: "9000000" }),
      quote("kraken", "64100"),
      quote("nobitex", "6500000000", {
        region: "ir",
        quote: "IRT",
        pair: "BTCIRT",
        open: "6400000000",
        median: "6500000000",
        volume_quote: "90000000000",
      }),
      quote("tinyex", "90000", { outlier: true }),
      quote("oldex", "61000", { stale: true, observed_at: "2026-11-09T08:00:00Z" }),
    ],
  }),
  "/api/v1/market-data/assets/ethereum/venues": () => ({
    asset: "ethereum",
    verified: false,
    quotes: [],
  }),
  "/api/v1/market-data/assets/bitcoin/candles": () => ({
    asset: "bitcoin",
    venue: "binance",
    quote: "USDT",
    interval: "1d",
    verified: false,
    candles: Array.from({ length: 30 }, (_, i) => {
      const c = String(60000 + i * 150);
      return { t: new Date(Date.UTC(2026, 9, 10 + i)).toISOString(), o: c, h: c, l: c, c };
    }),
  }),
  "/api/v1/public/site": () => ({ redirect: { needed: false }, sites: [] }),
  // The catalog feed: the blog's copy of it gives sitemaps, JSON-LD, and 410s.
  "/api/v1/market-data/feed/assets": () => ({
    items: [
      {
        slug: "bitcoin",
        updated_at: now,
        asset: bitcoin,
        structured_data: {
          "@type": "Thing",
          name: "Bitcoin",
          alternateName: "BTC",
          sameAs: ["https://bitcoin.org"],
        },
      },
      { slug: "ethereum", updated_at: now, asset: ether },
      { slug: "terra-classic", updated_at: now, removed: true },
    ],
    next_cursor: "c1",
    has_more: false,
  }),
  // The exchange's listed currencies; IRT is fiat, a quote only.
  "/api/v1/public/currencies": (url) => {
    const items = [
      currency("BTC", "Bitcoin", "بیت‌کوین"),
      currency("ETH", "Ethereum", "اتریوم"),
      {
        ...currency("IRT", "Toman", "تومان"),
        info: { symbol: "IRT", en_name: "Toman", if_fiat: true },
      },
    ];
    const symbols = url.searchParams.get("symbol")?.toUpperCase().split(",");
    return { items: symbols ? items.filter((c) => symbols.includes(c.info.symbol)) : items };
  },
};

createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (handleCms(req, res, url)) return;
  const { pathname } = url;
  const route = routes[pathname];
  res.setHeader("content-type", "application/json");
  if (!route) {
    res.statusCode = 404;
    res.end(JSON.stringify({ status: 404, message: "Not found", code: "not_found" }));
    return;
  }
  res.end(JSON.stringify({ status: 200, message: "OK", info: route(url) }));
}).listen(port, "127.0.0.1", () => console.log(`mock backend on ${port}`));
