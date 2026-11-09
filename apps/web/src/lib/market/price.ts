import type { Region } from "@/lib/config";
import { showsQuote } from "@/lib/region";
import type { VenueQuote } from "@/lib/backend/schemas";

/** The quotes a page prefers for "the price", best first. */
export const REFERENCE_QUOTES = ["USDT", "USD", "USDC"] as const;

export interface ReferencePrice {
  quote: string;
  /** The median of the usable venues' last prices. */
  price: number;
  /** The median change since the venues' 24h open, as a ratio. */
  change?: number;
  /** How many venues the price is the median of. */
  venues: number;
  observedAt: string;
  /** The venue whose candles the chart shows: the most traded usable one. */
  chartVenue: string;
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A finite number from a decimal string, or undefined. */
export function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** The quotes a release may show: no Iranian venues or toman prices abroad. */
export function visibleQuotes(quotes: VenueQuote[], region: Region): VenueQuote[] {
  return quotes.filter((q) => showsQuote(region, q.region, q.quote));
}

/**
 * The price of an asset for its page: the median last price of the venues
 * that are neither stale nor outliers, in the first reference quote that has
 * any. Stale and outlier prices are listed on the page but never counted.
 */
export function referencePrice(quotes: VenueQuote[], region: Region): ReferencePrice | undefined {
  for (const quote of REFERENCE_QUOTES) {
    const price = priceIn(quotes, quote, region);
    if (price) return price;
  }
  return undefined;
}

/**
 * The price in one quote: the median last price of the visible venues of
 * that quote that are neither stale nor outliers, or undefined when none is.
 */
export function priceIn(
  quotes: VenueQuote[],
  quote: string,
  region: Region,
): ReferencePrice | undefined {
  const wanted = quote.toUpperCase();
  const group = visibleQuotes(quotes, region).filter(
    (q) => !q.stale && !q.outlier && q.quote.toUpperCase() === wanted,
  );
  const prices = group.map((q) => toNumber(q.last)).filter((n): n is number => n !== undefined);
  const price = median(prices);
  if (price === undefined) return undefined;
  const changes = group.flatMap((q) => {
    const open = toNumber(q.open);
    const last = toNumber(q.last);
    return open && last !== undefined ? [last / open - 1] : [];
  });
  const byVolume = [...group].sort(
    (a, b) => (toNumber(b.volume_quote) ?? 0) - (toNumber(a.volume_quote) ?? 0),
  );
  return {
    quote: wanted,
    price,
    change: median(changes),
    venues: prices.length,
    observedAt: group
      .map((q) => q.observed_at)
      .sort()
      .at(-1)!,
    chartVenue: byVolume[0]!.venue,
  };
}

/** How far a venue's price is from the median of its quote, as a ratio. */
export function spreadFromMedian(quote: VenueQuote): number | undefined {
  const last = toNumber(quote.last);
  const mid = toNumber(quote.median);
  return last !== undefined && mid ? last / mid - 1 : undefined;
}
