import { marketData, paginate, publicApi } from "@/lib/backend";
import type { Asset, Currency, VenueComparison } from "@/lib/backend/schemas";
import { assetFor } from "./markets";

/** Every listed currency, by symbol; a short list the backend keeps cached. */
export async function listedCurrencies(maxPages = 10): Promise<Currency[]> {
  const all: Currency[] = [];
  for await (const items of paginate(
    (cursor) => publicApi.listCurrencies({ sort: "symbol", limit: 200, cursor }),
    maxPages,
  )) {
    all.push(...items);
  }
  return all;
}

/** The listed currency with this symbol (a previous symbol does not count). */
export async function listedCurrency(symbol: string): Promise<Currency | undefined> {
  const page = await publicApi.listCurrencies({ symbol, limit: 5 });
  return page.items.find((c) => c.info.symbol.toUpperCase() === symbol.toUpperCase());
}

/** A currency's catalog asset and its venues; either may be missing. */
export async function pricesFor(
  symbol: string,
): Promise<{ asset?: Asset; venues?: VenueComparison }> {
  const assets = await marketData.listAssets({ q: symbol, limit: 20 }).catch(() => undefined);
  const asset = assets && assetFor(symbol, assets.items);
  if (!asset) return {};
  const venues = await marketData.getVenues(asset.slug).catch(() => undefined);
  return { asset, venues };
}
