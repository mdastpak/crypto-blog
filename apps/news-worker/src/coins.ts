import { z } from "zod";
import { log } from "./log.ts";
import { normalizeLetters } from "./normalize.ts";

export interface CatalogAsset {
  slug: string;
  symbol: string;
  name: string;
  rank?: number;
}

/** Persian names of the most written-about coins; the catalog has English names only. */
const PERSIAN_NAMES: Record<string, string[]> = {
  bitcoin: ["بیت کوین", "بیتکوین"],
  ethereum: ["اتریوم", "اتریم"],
  tether: ["تتر"],
  binancecoin: ["بایننس کوین", "بی ان بی"],
  solana: ["سولانا"],
  ripple: ["ریپل"],
  cardano: ["کاردانو"],
  dogecoin: ["دوج کوین", "دوجکوین"],
  tron: ["ترون"],
  toncoin: ["تون کوین", "تونکوین"],
  litecoin: ["لایت کوین", "لایتکوین"],
  "shiba-inu": ["شیبا"],
};

/**
 * Uppercase words that look like tickers but are not, in crypto news. A
 * symbol among them matches only as `$SYMBOL`.
 */
const NOT_TICKERS = new Set(
  (
    "A I AN AND ARE AT BE BY CEO CFO CTO DAO DEX CEX DEFI ETF ETFS EU FBI FED FOR GDP IMF IPO IRS " +
    "IT ITS NFT NFTS OF ON OR SEC THE TO UK UN US USA USD EUR GBP JPY CNY IRR IRT AI API APP ATH " +
    "ATL BTC-ETF CPI FOMC KYC AML OTC P2P PR Q1 Q2 Q3 Q4 TVL UTC WEB3 NEW ONE ALL BIG HOT GAS SUN"
  ).split(" "),
);

/** Names that are everyday words: they match only next to the coin's symbol. */
const COMMON_NAMES = new Set(
  "gas sun one dash maker pepe bonk ocean flow render arweave graph status origin harmony celo kava loopring theta".split(
    " ",
  ),
);

export interface CoinMatcher {
  match(title: string, text: string): string[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Finds the catalog coins an item mentions, with rules against false hits:
 *
 * - A name matches as a whole word, any case; a name that is an everyday
 *   word ("Gas", "Sun") matches only when its symbol is also present.
 * - A symbol matches only in capitals as a whole word, at least three
 *   letters, and not an acronym of news ("SEC", "ETF"), unless written as
 *   `$SYMBOL`.
 * - A symbol several coins share matches only the one whose name is also
 *   present.
 * - Persian names of the top coins match in Persian text.
 */
export function createMatcher(assets: CatalogAsset[]): CoinMatcher {
  const bySymbol = new Map<string, CatalogAsset[]>();
  const names: { slug: string; pattern: RegExp; common: boolean; symbol: string }[] = [];
  for (const asset of assets) {
    const symbol = asset.symbol.toUpperCase();
    bySymbol.set(symbol, [...(bySymbol.get(symbol) ?? []), asset]);
    if (asset.name.length >= 3) {
      names.push({
        slug: asset.slug,
        symbol,
        common: COMMON_NAMES.has(asset.name.toLowerCase()),
        pattern: new RegExp(`(^|[^\\p{L}\\p{N}])${escape(asset.name)}($|[^\\p{L}\\p{N}])`, "iu"),
      });
    }
    for (const persian of PERSIAN_NAMES[asset.slug] ?? []) {
      names.push({
        slug: asset.slug,
        symbol,
        common: false,
        pattern: new RegExp(`(^|[^\\p{L}])${escape(persian)}($|[^\\p{L}])`, "u"),
      });
    }
  }

  return {
    match(title: string, text: string): string[] {
      const haystack = normalizeLetters(`${title} \n ${text}`);
      // Every word in capitals, and those that count as tickers on their own.
      const capitals = new Set<string>();
      const symbols = new Set<string>();
      for (const m of haystack.matchAll(
        /(^|[^\p{L}\p{N}$])(\$?)([A-Z][A-Z0-9]{1,9})(?=$|[^\p{L}\p{N}])/gu,
      )) {
        const dollar = m[2] === "$";
        const symbol = m[3]!;
        capitals.add(symbol);
        if (dollar || (symbol.length >= 3 && !NOT_TICKERS.has(symbol))) symbols.add(symbol);
      }
      const named = new Set<string>();
      for (const n of names) {
        if (n.pattern.test(haystack) && (!n.common || capitals.has(n.symbol))) named.add(n.slug);
      }
      const found = new Set(named);
      for (const symbol of symbols) {
        const candidates = bySymbol.get(symbol) ?? [];
        if (candidates.length === 1) found.add(candidates[0]!.slug);
        else for (const c of candidates) if (named.has(c.slug)) found.add(c.slug);
      }
      return [...found].sort();
    },
  };
}

const pageSchema = z.object({
  info: z.object({
    items: z.array(
      z.object({
        slug: z.string(),
        symbol: z.string(),
        name: z.string(),
        market_cap_rank: z.number().nullish(),
      }),
    ),
    next_cursor: z.string().nullish(),
  }),
});

/** The catalog's top assets from the backend, at most `maxPages` pages. */
export async function loadCatalog(
  backendApiUrl: string,
  fetchFn: typeof fetch = fetch,
  maxPages = 4,
): Promise<CatalogAsset[]> {
  const assets: CatalogAsset[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`${backendApiUrl}/market-data/assets`);
    url.searchParams.set("limit", "250");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetchFn(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`catalog answered ${response.status}`);
    const { info } = pageSchema.parse(await response.json());
    assets.push(
      ...info.items.map((a) => ({
        slug: a.slug,
        symbol: a.symbol,
        name: a.name,
        rank: a.market_cap_rank ?? undefined,
      })),
    );
    if (!info.next_cursor || info.next_cursor === cursor) break;
    cursor = info.next_cursor;
  }
  return assets;
}

/** Keeps a matcher of the catalog, refreshed every few hours; empty until it loads. */
export class CatalogCache {
  private matcher: CoinMatcher = createMatcher([]);
  private loadedAt = 0;

  constructor(
    private readonly backendApiUrl: string | undefined,
    private readonly refreshMs = 6 * 3600_000,
  ) {}

  async current(): Promise<CoinMatcher> {
    if (!this.backendApiUrl || Date.now() - this.loadedAt < this.refreshMs) return this.matcher;
    try {
      const assets = await loadCatalog(this.backendApiUrl);
      this.matcher = createMatcher(assets);
      this.loadedAt = Date.now();
      log("info", "coin catalog loaded", { assets: assets.length });
    } catch (error) {
      // Retry in ten minutes; items meanwhile get no coins.
      this.loadedAt = Date.now() - this.refreshMs + 600_000;
      log("warn", "coin catalog unavailable", { error: String(error) });
    }
    return this.matcher;
  }
}
