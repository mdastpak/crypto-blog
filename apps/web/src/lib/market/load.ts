import { marketData, paginate, publicApi } from "@/lib/backend";
import type { Asset, Currency, VenueComparison } from "@/lib/backend/schemas";
import type { CoinRow } from "@/components/coins/CoinTable";
import type { Region } from "@/lib/config";
import { mapSettled } from "./concurrency";
import { assetFor } from "./markets";
import { referencePrice } from "./price";

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

/**
 * The rows of a list of coins with their prices. The list has no prices:
 * each row's comes from its venues, cached for 30 seconds, a few calls at a
 * time. A failed one leaves the row without a price.
 */
export async function coinRows(assets: Asset[], region: Region): Promise<CoinRow[]> {
  const prices = await mapSettled(assets, 8, async (asset) =>
    referencePrice((await marketData.getVenues(asset.slug)).quotes, region),
  );
  return assets.map((asset, i) => ({ asset, price: prices[i] }));
}
