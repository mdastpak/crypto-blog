import "server-only";
import type { Metadata } from "next";
import { getBrand } from "@/design/brands";
import type { Locale } from "@/i18n/locales";
import { publicApi } from "@/lib/backend";
import type { Site } from "@/lib/backend/schemas";
import { getConfig } from "@/lib/config";
import { hreflangLinks } from "./alternates";

/** The country sites, for hreflang; none when the backend cannot say. */
export async function countrySites(): Promise<Site[]> {
  try {
    return (await publicApi.getSites()).sites ?? [];
  } catch {
    return [];
  }
}

export interface PageSeo {
  locale: Locale;
  /** The path after the locale, e.g. `coins/bitcoin`; empty for the home page. */
  path: string;
  title: string;
  /** The title as is, without the layout's "| brand" suffix (the home page). */
  absoluteTitle?: boolean;
  description?: string;
  /** The locales the page exists in; every enabled one by default. */
  locales?: Locale[];
  /** The locale of the canonical URL, when the page shows another language's text. */
  canonicalLocale?: Locale;
  image?: { url: string; width?: number; height?: number; alt?: string };
  noindex?: boolean;
  article?: { publishedTime?: string; modifiedTime?: string; section?: string };
}

/**
 * Title, description, canonical URL, hreflang links on every country site
 * (with x-default), Open Graph, and the Twitter card of a page.
 */
export async function pageMetadata(seo: PageSeo): Promise<Metadata> {
  const { publicSiteUrl, locales: enabled, defaultLocale, brand: brandId } = getConfig();
  const locales = (seo.locales ?? enabled).filter((l) => enabled.includes(l));
  const canonicalLocale = seo.canonicalLocale ?? seo.locale;
  const canonical = `${publicSiteUrl}/${canonicalLocale}${seo.path ? `/${seo.path}` : ""}`;
  const { languages } = hreflangLinks({
    path: seo.path,
    locales,
    sites: await countrySites(),
    ownUrl: publicSiteUrl,
    defaultLocale,
  });
  const brand = getBrand(brandId);
  const images = seo.image
    ? [
        {
          ...seo.image,
          url: seo.image.url.startsWith("/") ? `${publicSiteUrl}${seo.image.url}` : seo.image.url,
        },
      ]
    : undefined;
  return {
    title: seo.absoluteTitle ? { absolute: seo.title } : seo.title,
    description: seo.description,
    alternates: { canonical, languages },
    robots: seo.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: canonical,
      siteName: brand.name[seo.locale],
      locale: canonicalLocale,
      ...(seo.article
        ? {
            type: "article" as const,
            publishedTime: seo.article.publishedTime,
            modifiedTime: seo.article.modifiedTime,
            section: seo.article.section,
          }
        : { type: "website" as const }),
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: seo.title,
      description: seo.description,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
  };
}
