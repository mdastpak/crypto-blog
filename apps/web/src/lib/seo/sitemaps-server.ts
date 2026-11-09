import "server-only";
import { getBrand } from "@/design/brands";
import type { Locale } from "@/i18n/locales";
import { cmsEnabled, listArticles, listCampaigns } from "@/lib/cms";
import type { Page } from "@/lib/cms/schemas";
import { getConfig } from "@/lib/config";
import { listedCurrencies } from "@/lib/market/load";
import { marketPath, marketQuotes, marketsOf } from "@/lib/market/markets";
import { hreflangLinks } from "./alternates";
import { CATALOG_SYNC_MS, catalog } from "./catalog-server";
import { countrySites } from "./metadata";
import {
  chunks,
  newsUrlset,
  sitemapIndex,
  urlset,
  type SitemapName,
  type SitemapUrl,
} from "./sitemap";

export const COINS_PER_FILE = 10_000;
/** Google News takes articles of the last two days. */
const NEWS_WINDOW_MS = 48 * 3600_000;

async function linker() {
  const { publicSiteUrl, locales, defaultLocale } = getConfig();
  const sites = await countrySites();
  return (
    locale: Locale,
    path: string,
    available: Locale[] = locales,
    lastmod?: string,
  ): SitemapUrl => ({
    loc: `${publicSiteUrl}/${locale}${path ? `/${path}` : ""}`,
    lastmod,
    alternates: hreflangLinks({
      path,
      locales: available,
      sites,
      ownUrl: publicSiteUrl,
      defaultLocale,
    }).languages,
  });
}

/** Every item of a paginated CMS list, up to `maxPages` pages. */
async function all<T>(fetchPage: (page: number) => Promise<Page<T>>, maxPages = 200): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchPage(page);
    items.push(...result.docs);
    if (page >= result.totalPages) break;
  }
  return items;
}

const translated = (title: Partial<Record<string, string | null | undefined>>, enabled: Locale[]) =>
  enabled.filter((l) => !!title[l]);

export async function buildIndex(): Promise<string> {
  const { publicSiteUrl, locales } = getConfig();
  const copy = catalog();
  await copy.fresh(CATALOG_SYNC_MS).catch(() => {});
  const coinFiles = Math.max(1, Math.ceil(copy.live().length / COINS_PER_FILE));
  const names: string[] = [];
  for (const l of locales) {
    names.push(`pages-${l}.xml`, `markets-${l}.xml`);
    for (let i = 0; i < coinFiles; i += 1) names.push(`coins-${l}-${i}.xml`);
    if (cmsEnabled()) names.push(`articles-${l}.xml`, `campaigns-${l}.xml`);
  }
  if (cmsEnabled()) names.push("news.xml");
  return sitemapIndex(names.map((n) => ({ loc: `${publicSiteUrl}/sitemaps/${n}` })));
}

/** One sitemap file, or undefined when the name names none. */
export async function buildSitemap(name: SitemapName): Promise<string | undefined> {
  const { locales, region, marketQuotes: configured, brand } = getConfig();
  if (name.kind === "news") {
    if (!cmsEnabled()) return undefined;
    const since = new Date(Date.now() - NEWS_WINDOW_MS).toISOString();
    const { publicSiteUrl } = getConfig();
    const urls = [];
    for (const l of locales) {
      const news = await all(
        (page) => listArticles(l, { type: "news", publishedSince: since, limit: 100, page }),
        10,
      );
      for (const a of news) {
        if (!a.publishedAt || !a.title[l]) continue;
        urls.push({
          loc: `${publicSiteUrl}/${l}/blog/${a.slug}`,
          title: a.title[l]!,
          language: l,
          publishedAt: a.publishedAt,
          publication: getBrand(brand).name[l],
        });
      }
    }
    return newsUrlset(urls.slice(0, 1000));
  }

  const locale = name.locale as Locale;
  if (!locales.includes(locale)) return undefined;
  const url = await linker();

  switch (name.kind) {
    case "pages": {
      const paths = ["", "coins", "markets", ...(cmsEnabled() ? ["blog", "campaigns"] : [])];
      return urlset(paths.map((p) => url(locale, p)));
    }
    case "coins": {
      const copy = catalog();
      await copy.fresh(CATALOG_SYNC_MS);
      const parts = chunks(copy.live(), COINS_PER_FILE);
      const part = parts[name.part] ?? (name.part === 0 ? [] : undefined);
      if (!part) return undefined;
      return urlset(part.map((e) => url(locale, `coins/${e.slug}`, locales, e.updatedAt)));
    }
    case "markets": {
      const currencies = await listedCurrencies();
      const markets = marketsOf(currencies, marketQuotes(configured, region));
      return urlset(markets.map((m) => url(locale, `markets/${marketPath(m.base, m.quote)}`)));
    }
    case "articles": {
      if (!cmsEnabled()) return undefined;
      const articles = await all((page) => listArticles(locale, { limit: 100, page }));
      return urlset(
        articles.map((a) =>
          url(
            locale,
            `blog/${a.slug}`,
            translated(a.title, locales),
            a.updatedAt ?? a.publishedAt ?? undefined,
          ),
        ),
      );
    }
    case "campaigns": {
      if (!cmsEnabled()) return undefined;
      const campaigns = await all((page) => listCampaigns(locale, { limit: 100, page }));
      return urlset(
        campaigns.map((c) => url(locale, `campaigns/${c.slug}`, translated(c.title, locales))),
      );
    }
  }
}
