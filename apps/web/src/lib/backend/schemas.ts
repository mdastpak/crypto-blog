import { z } from "zod";

/**
 * Schemas of the backend responses this site reads (Crypto-Exchange
 * docs/api.md). Unknown fields are dropped, so the backend can add fields
 * without breaking pages; a missing or mistyped field we rely on fails
 * validation at the boundary instead of deep in a page.
 *
 * Decimal amounts (prices, supplies, volumes) stay strings, as the backend
 * sends them, so no precision is lost; convert at display time.
 *
 * `contract.test.ts` checks every field here against a snapshot of the
 * backend's OpenAPI document.
 */

const decimal = z.string().regex(/^-?\d+(\.\d+)?$/, "not a decimal string");
const timestamp = z.iso.datetime({ offset: true });

/** `{ status, message, code?, request_id?, info? }` */
export const envelopeSchema = z.object({
  status: z.number().int(),
  message: z.string().optional(),
  code: z.string().optional(),
  request_id: z.string().optional(),
  info: z.unknown().optional(),
});

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    next_cursor: z.string().optional(),
  });
}

// ---- Market data catalog (/market-data) ----

export const contractSchema = z.object({
  network: z.string(),
  address: z.string(),
});

export const assetSchema = z.object({
  slug: z.string().min(1),
  symbol: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().optional(),
  description: z.string().optional(),
  logo_url: z.string().optional(),
  links: z.record(z.string(), z.string()).optional(),
  market_cap_rank: z.number().int().optional(),
  circulating_supply: decimal.optional(),
  total_supply: decimal.optional(),
  max_supply: decimal.optional(),
  contracts: z.array(contractSchema).optional(),
  attribution: z.string().optional(),
  verified: z.boolean(),
  label: z.string().optional(),
  active: z.boolean().optional(),
  updated_at: timestamp.optional(),
});
export type Asset = z.infer<typeof assetSchema>;

export const assetPageSchema = pageSchema(assetSchema);
export type AssetPage = z.infer<typeof assetPageSchema>;

export const venueQuoteSchema = z.object({
  venue: z.string(),
  venue_name: z.string().optional(),
  region: z.string().optional(),
  pair: z.string(),
  quote: z.string(),
  last: decimal,
  bid: decimal.optional(),
  ask: decimal.optional(),
  open: decimal.optional(),
  high: decimal.optional(),
  low: decimal.optional(),
  volume_base: decimal.optional(),
  volume_quote: decimal.optional(),
  median: decimal.optional(),
  observed_at: timestamp,
  stale: z.boolean(),
  outlier: z.boolean(),
});
export type VenueQuote = z.infer<typeof venueQuoteSchema>;

export const venueComparisonSchema = z.object({
  asset: z.string(),
  verified: z.boolean(),
  label: z.string().optional(),
  outlier_percent: decimal.optional(),
  stale_after_seconds: z.number().int().optional(),
  quotes: z.array(venueQuoteSchema),
});
export type VenueComparison = z.infer<typeof venueComparisonSchema>;

export const candleSchema = z.object({
  t: timestamp,
  o: decimal,
  h: decimal,
  l: decimal,
  c: decimal,
  v: decimal.optional(),
});
export type Candle = z.infer<typeof candleSchema>;

export const chartSchema = z.object({
  asset: z.string(),
  venue: z.string(),
  quote: z.string(),
  interval: z.string(),
  from: timestamp.optional(),
  to: timestamp.optional(),
  verified: z.boolean(),
  label: z.string().optional(),
  candles: z.array(candleSchema),
});
export type Chart = z.infer<typeof chartSchema>;

export const feedItemSchema = z.object({
  slug: z.string().min(1),
  updated_at: timestamp,
  removed: z.boolean().optional(),
  asset: assetSchema.optional(),
  attribution: z.object({ text: z.string(), url: z.string().optional() }).optional(),
  structured_data: z.record(z.string(), z.unknown()).optional(),
});
export type FeedItem = z.infer<typeof feedItemSchema>;

export const feedPageSchema = pageSchema(feedItemSchema).extend({
  has_more: z.boolean().optional(),
});
export type FeedPage = z.infer<typeof feedPageSchema>;

// ---- Public routes (/public) ----

export const currencySchema = z.object({
  hk: z.string(),
  status: z.string().optional(),
  info: z.object({
    symbol: z.string(),
    en_name: z.string().optional(),
    fa_name: z.string().optional(),
    logo_url: z.string().optional(),
    contract: z.string().optional(),
    is_token: z.boolean().optional(),
    if_fiat: z.boolean().optional(),
  }),
  previous_symbols: z.array(z.unknown()).optional(),
  updated_at: timestamp.optional(),
});
export type Currency = z.infer<typeof currencySchema>;

export const currencyPageSchema = pageSchema(currencySchema);

export const backendLocaleSchema = z.object({
  code: z.string(),
  dir: z.enum(["ltr", "rtl"]),
  name: z.string().optional(),
  native_name: z.string().optional(),
});

export const localesInfoSchema = z.object({
  locales: z.array(backendLocaleSchema),
  default: z.string(),
  current: backendLocaleSchema.optional(),
  source: z.string().optional(),
});
export type LocalesInfo = z.infer<typeof localesInfoSchema>;

export const statusSchema = z.object({
  mode: z.string(),
  active: z.array(z.unknown()).optional(),
  scheduled: z.array(z.unknown()).optional(),
  lockdowns: z.array(z.unknown()).optional(),
});
export type PlatformStatus = z.infer<typeof statusSchema>;

export const siteSchema = z.object({
  id: z.string(),
  domain: z.string(),
  url: z.string().optional(),
  locales: z.array(z.string()).optional(),
  default_locale: z.string().optional(),
  countries: z.array(z.string()).optional(),
  enforce: z.boolean().optional(),
});
export type Site = z.infer<typeof siteSchema>;

export const alternateSchema = z.object({
  hreflang: z.string(),
  locale: z.string().optional(),
  site: z.string().optional(),
  url: z.string(),
});
export type Alternate = z.infer<typeof alternateSchema>;

/** `GET /public/site`: the visitor's site, locale, and redirect decision. */
export const siteInfoSchema = z.object({
  country: z.string().optional(),
  country_source: z.string().optional(),
  current_site: z.string().optional(),
  site: siteSchema.optional(),
  reason: z.string().optional(),
  locale: backendLocaleSchema.optional(),
  locale_source: z.string().optional(),
  redirect: z.object({ needed: z.boolean(), url: z.string().optional() }).optional(),
  sites: z.array(siteSchema).optional(),
  alternates: z.array(alternateSchema).optional(),
});
export type SiteInfo = z.infer<typeof siteInfoSchema>;
