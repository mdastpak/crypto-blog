/**
 * schema.org JSON-LD for the pages. Builders return plain objects; the
 * <JsonLd> component serializes them safely into a script tag.
 */
export type JsonLdObject = Record<string, unknown>;

/** JSON for a <script> element: `<` escaped, so no text can close the tag. */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const absolute = (base: string, href: string) => (href.startsWith("/") ? `${base}${href}` : href);

export function breadcrumbList(
  base: string,
  items: { label: string; href?: string }[],
  current: string,
): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      item: absolute(base, item.href ?? current),
    })),
  };
}

export function organization({
  name,
  url,
  logo,
}: {
  name: string;
  url: string;
  logo: string;
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${url}/#organization`,
    name,
    url,
    logo: absolute(url, logo),
  };
}

export function website({
  name,
  url,
  locale,
}: {
  name: string;
  url: string;
  locale: string;
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url: `${url}/${locale}`,
    inLanguage: locale,
    publisher: { "@id": `${url}/#organization` },
  };
}

/**
 * A coin: the catalog's schema.org `Thing` (the feed's structured_data,
 * with name, symbol, description, logo, sameAs, identifiers), or a minimal
 * one, with the URL of its page added.
 */
export function coinThing(
  structured: JsonLdObject | undefined,
  fallback: { name: string; symbol: string; description?: string; logo?: string },
  url: string,
): JsonLdObject {
  const base: JsonLdObject = structured
    ? { ...structured }
    : {
        "@type": "Thing",
        name: fallback.name,
        alternateName: fallback.symbol,
        ...(fallback.description ? { description: fallback.description } : {}),
        ...(fallback.logo ? { image: fallback.logo } : {}),
      };
  return { "@context": "https://schema.org", ...base, url };
}

export function article({
  news,
  headline,
  description,
  url,
  locale,
  image,
  publishedAt,
  updatedAt,
  author,
  publisher,
  sources,
  generated,
}: {
  news: boolean;
  headline: string;
  description?: string;
  url: string;
  locale: string;
  image?: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
  author?: { name: string; url: string };
  publisher: { name: string; url: string; logo: string };
  sources: { name: string; url: string }[];
  /** Drafted by the news worker: no person is the author. */
  generated: boolean;
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": news ? "NewsArticle" : "Article",
    headline: headline.slice(0, 110),
    ...(description ? { description } : {}),
    url,
    mainEntityOfPage: url,
    inLanguage: locale,
    ...(image ? { image: [image] } : {}),
    ...(publishedAt ? { datePublished: publishedAt } : {}),
    ...(updatedAt || publishedAt ? { dateModified: updatedAt ?? publishedAt } : {}),
    author:
      author && !generated
        ? { "@type": "Person", name: author.name, url: author.url }
        : { "@type": "Organization", name: publisher.name, url: publisher.url },
    publisher: {
      "@type": "Organization",
      "@id": `${publisher.url}/#organization`,
      name: publisher.name,
      logo: { "@type": "ImageObject", url: absolute(publisher.url, publisher.logo) },
    },
    ...(sources.length
      ? { citation: sources.map((s) => ({ "@type": "CreativeWork", name: s.name, url: s.url })) }
      : {}),
  };
}
