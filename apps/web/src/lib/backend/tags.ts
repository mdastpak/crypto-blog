/**
 * Cache tags of backend data, for targeted revalidation: a change to one
 * asset revalidates the pages that show it, and nothing else.
 */
export const tags = {
  assets: "assets",
  asset: (slug: string) => `asset:${slug}`,
  venues: (slug: string) => `asset:${slug}:venues`,
  candles: (slug: string) => `asset:${slug}:candles`,
  currencies: "currencies",
  locales: "locales",
  status: "status",
  sites: "sites",
};
