/**
 * Coin logos (#31). The market-data sources give each asset a logo on their
 * own image hosts, and an admin may set a currency's logo to any https URL.
 * A visitor's browser never fetches them there: that would send every
 * visitor's address to a third party, and the hosts are often unreachable
 * from Iran. Pages link to this app's /coin-logo route instead, which
 * fetches the image server side from an allowed host (COIN_LOGO_HOSTS),
 * accepts raster images only, and keeps them in the shared cache, so a logo
 * still loads while its source is down.
 */

/** The image hosts of CoinGecko and CoinMarketCap. */
export const DEFAULT_COIN_LOGO_HOSTS = [
  "assets.coingecko.com",
  "coin-images.coingecko.com",
  "s2.coinmarketcap.com",
] as const;

/** The path of the route that serves logos. */
export const COIN_LOGO_PATH = "/coin-logo";

/** Raster image types; SVG is refused, since it can carry script. */
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

/** The largest logo accepted, in bytes. */
export const MAX_LOGO_BYTES = 512 * 1024;

/**
 * The source URL of a logo when it may be fetched: https, on an allowed
 * host, on the default port, without credentials, at most 2048 characters.
 */
export function allowedLogoUrl(
  value: string | undefined | null,
  hosts: readonly string[],
): URL | undefined {
  if (!value || value.length > 2048) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return undefined;
  if (!hosts.includes(url.hostname.toLowerCase())) return undefined;
  return url;
}

/** The path under which this app serves a logo, or none when it may not be fetched. */
export function coinLogoPath(
  value: string | undefined | null,
  hosts: readonly string[],
): string | undefined {
  const url = allowedLogoUrl(value, hosts);
  return url ? `${COIN_LOGO_PATH}?u=${encodeURIComponent(url.href)}` : undefined;
}
