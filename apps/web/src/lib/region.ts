import type { Region } from "./config";

/**
 * What a release may show, by its region (DEPLOYMENT_REGION, the same value
 * as the backend). Pages ask here, never compare the region string
 * themselves, so a new Iran-only feature is added in one place.
 */
export interface RegionFeatures {
  /** Prices of Iranian exchanges, and pairs quoted in toman or rial. */
  iranianVenues: boolean;
  /** Prices quoted in IRT/IRR. */
  irtPrices: boolean;
  /** Mentions of Iranian payment gateways and identity checks. */
  iranianPayments: boolean;
}

const FEATURES: Record<Region, RegionFeatures> = {
  ir: { iranianVenues: true, irtPrices: true, iranianPayments: true },
  international: { iranianVenues: false, irtPrices: false, iranianPayments: false },
};

export function regionFeatures(region: Region): RegionFeatures {
  return FEATURES[region];
}

/** The venue regions of the market data that a release may show. */
export function venueRegions(region: Region): ("global" | "ir")[] {
  return FEATURES[region].iranianVenues ? ["global", "ir"] : ["global"];
}

const IRANIAN_QUOTES = new Set(["IRT", "IRR", "TMN"]);

/** Whether a release may show a price of this venue region and quote. */
export function showsQuote(
  region: Region,
  venueRegion: string | undefined,
  quote: string,
): boolean {
  if (venueRegion === "ir" && !FEATURES[region].iranianVenues) return false;
  if (IRANIAN_QUOTES.has(quote.toUpperCase()) && !FEATURES[region].irtPrices) return false;
  return true;
}
