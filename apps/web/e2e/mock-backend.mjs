// A stand-in for the exchange backend in end-to-end tests: fixed answers for
// the routes the pages read, so the tests need no network or real backend.
import { createServer } from "node:http";

const port = Number(process.env.MOCK_BACKEND_PORT ?? 3199);
const now = "2026-11-09T10:00:00Z";

const bitcoin = {
  slug: "bitcoin",
  symbol: "BTC",
  name: "Bitcoin",
  kind: "coin",
  description: "The first decentralized cryptocurrency.",
  links: { homepage: "https://bitcoin.org" },
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
      quote("nobitex", "6500000000", { region: "ir", quote: "IRT", pair: "BTCIRT" }),
      quote("tinyex", "90000", { outlier: true }),
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
  "/api/v1/public/site": () => ({ redirect: { needed: false } }),
};

createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  const route = routes[pathname];
  res.setHeader("content-type", "application/json");
  if (!route) {
    res.statusCode = 404;
    res.end(JSON.stringify({ status: 404, message: "Not found", code: "not_found" }));
    return;
  }
  res.end(JSON.stringify({ status: 200, message: "OK", info: route() }));
}).listen(port, "127.0.0.1", () => console.log(`mock backend on ${port}`));
