import "server-only";
import { getConfig } from "@/lib/config";
import { CircuitBreaker } from "./breaker";
import { BackendClient } from "./client";
import {
  assetPageSchema,
  assetSchema,
  chartSchema,
  currencyPageSchema,
  feedPageSchema,
  localesInfoSchema,
  statusSchema,
  venueComparisonSchema,
} from "./schemas";
import { tags } from "./tags";

/**
 * How long each kind of data may be served from the cache before it is
 * refreshed in the background, in seconds. Prices change by the second but
 * pages show them as of the last refresh; live prices come over WebSocket.
 */
export const REVALIDATE = {
  prices: 30,
  candles: 60,
  catalog: 300,
  reference: 3600,
} as const;

const KEY = Symbol.for("crypto-blog.backend");
const store = globalThis as typeof globalThis & { [KEY]?: BackendClient };

/** The process's client; one breaker per process. */
export function backend(): BackendClient {
  if (!store[KEY]) {
    const config = getConfig();
    store[KEY] = new BackendClient({
      baseUrl: config.backendApiUrl,
      timeoutMs: config.backendTimeoutMs,
      breaker: new CircuitBreaker(),
    });
  }
  return store[KEY];
}

export interface PageQuery {
  limit?: number;
  cursor?: string;
}

export const marketData = {
  /** Assets by market cap rank, the unranked last. */
  listAssets: (query: PageQuery & { q?: string } = {}) =>
    backend().get("/market-data/assets", assetPageSchema, {
      query: { ...query },
      revalidate: REVALIDATE.catalog,
      tags: [tags.assets],
    }),

  getAsset: (slug: string) =>
    backend().get(`/market-data/assets/${encodeURIComponent(slug)}`, assetSchema, {
      revalidate: REVALIDATE.catalog,
      tags: [tags.asset(slug)],
    }),

  /** The latest price at each venue, with stale and outlier marks. */
  getVenues: (slug: string) =>
    backend().get(`/market-data/assets/${encodeURIComponent(slug)}/venues`, venueComparisonSchema, {
      revalidate: REVALIDATE.prices,
      tags: [tags.venues(slug)],
    }),

  getCandles: (
    slug: string,
    query: { venue?: string; quote?: string; interval?: string; from?: string; to?: string } = {},
  ) =>
    backend().get(`/market-data/assets/${encodeURIComponent(slug)}/candles`, chartSchema, {
      query,
      revalidate: REVALIDATE.candles,
      tags: [tags.candles(slug)],
    }),

  /**
   * The assets in the order they changed, for keeping a copy (sitemaps,
   * revalidation). Never cached: each call must see the latest changes.
   */
  feed: (query: PageQuery & { updatedSince?: string } = {}) =>
    backend().get("/market-data/feed/assets", feedPageSchema, {
      query: { limit: query.limit, cursor: query.cursor, updated_since: query.updatedSince },
      revalidate: 0,
    }),
};

export const publicApi = {
  listCurrencies: (query: PageQuery & { q?: string; sort?: string; symbol?: string } = {}) =>
    backend().get("/public/currencies", currencyPageSchema, {
      query: { ...query },
      revalidate: REVALIDATE.catalog,
      tags: [tags.currencies],
    }),

  getLocales: () =>
    backend().get("/public/locales", localesInfoSchema, {
      revalidate: REVALIDATE.reference,
      tags: [tags.locales],
    }),

  getStatus: () =>
    backend().get("/public/status", statusSchema, {
      revalidate: 30,
      tags: [tags.status],
    }),
};
