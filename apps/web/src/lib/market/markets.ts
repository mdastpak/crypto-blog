import type { Asset, Currency } from "@/lib/backend/schemas";
import type { Region } from "@/lib/config";
import { showsQuote } from "@/lib/region";

/**
 * The exchange's markets: every listed currency against each quote of
 * MARKET_QUOTES that the release may show (no IRT abroad). Fiat currencies
 * are only quotes, never bases.
 */
export interface Market {
  base: string;
  quote: string;
  currency: Currency;
}

/** The quotes a release shows, in the configured order. */
export function marketQuotes(configured: string[], region: Region): string[] {
  return configured.filter((q) => showsQuote(region, undefined, q));
}

export function marketsOf(currencies: Currency[], quotes: string[]): Market[] {
  return currencies
    .filter((c) => !c.info.if_fiat)
    .flatMap((currency) => {
      const base = currency.info.symbol.toUpperCase();
      return quotes.filter((q) => q !== base).map((quote) => ({ base, quote, currency }));
    });
}

/** The path segment of a market: `btc-usdt`. */
export function marketPath(base: string, quote: string): string {
  return `${base}-${quote}`.toLowerCase();
}

const PAIR = /^([a-z0-9]{1,15})-([a-z0-9]{2,10})$/;

/** The base and quote of a path segment, upper case, or undefined when it is not one. */
export function parseMarket(segment: string): { base: string; quote: string } | undefined {
  const match = PAIR.exec(segment);
  return match ? { base: match[1]!.toUpperCase(), quote: match[2]!.toUpperCase() } : undefined;
}

/**
 * The catalog asset of a listed currency: one with the same symbol, the one
 * linked to the exchange (verified) first, then the best ranked.
 */
export function assetFor(symbol: string, assets: Asset[]): Asset | undefined {
  const wanted = symbol.toUpperCase();
  return assets
    .filter((a) => a.symbol.toUpperCase() === wanted)
    .sort(
      (a, b) =>
        Number(b.verified) - Number(a.verified) ||
        (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity),
    )[0];
}

/** The currency's name in the page's language, the other one, or its symbol. */
export function currencyName(currency: Currency, locale: string): string {
  const { fa_name, en_name, symbol } = currency.info;
  return (locale === "fa" ? fa_name || en_name : en_name || fa_name) || symbol;
}
