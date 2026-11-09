/** Sitemap XML (sitemaps.org, with hreflang links and Google News). */
export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  /** hreflang → URL, x-default included. */
  alternates?: Record<string, string>;
}

export interface NewsUrl {
  loc: string;
  title: string;
  language: string;
  publishedAt: string;
  publication: string;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';

const lastmod = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `<lastmod>${date.toISOString()}</lastmod>`;
};

export function sitemapIndex(sitemaps: { loc: string; lastmod?: string }[]): string {
  return (
    HEAD +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    sitemaps
      .map((s) => `<sitemap><loc>${escapeXml(s.loc)}</loc>${lastmod(s.lastmod)}</sitemap>`)
      .join("\n") +
    "\n</sitemapindex>\n"
  );
}

export function urlset(urls: SitemapUrl[]): string {
  return (
    HEAD +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    urls
      .map((u) => {
        const links = Object.entries(u.alternates ?? {})
          .map(
            ([hreflang, href]) =>
              `<xhtml:link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(href)}"/>`,
          )
          .join("");
        return `<url><loc>${escapeXml(u.loc)}</loc>${lastmod(u.lastmod)}${links}</url>`;
      })
      .join("\n") +
    "\n</urlset>\n"
  );
}

/** A Google News sitemap: news of the last two days only. */
export function newsUrlset(urls: NewsUrl[]): string {
  return (
    HEAD +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n' +
    urls
      .map(
        (u) =>
          `<url><loc>${escapeXml(u.loc)}</loc><news:news><news:publication><news:name>${escapeXml(u.publication)}</news:name><news:language>${escapeXml(u.language)}</news:language></news:publication><news:publication_date>${new Date(u.publishedAt).toISOString()}</news:publication_date><news:title>${escapeXml(u.title)}</news:title></news:news></url>`,
      )
      .join("\n") +
    "\n</urlset>\n"
  );
}

/** Splits a list into sitemap files of at most `size` URLs. */
export function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type SitemapName =
  | { kind: "pages" | "markets" | "articles" | "campaigns"; locale: string }
  | { kind: "coins"; locale: string; part: number }
  | { kind: "news" };

/** The sitemap a file name names: `coins-en-0.xml`, `articles-fa.xml`, `news.xml`. */
export function parseSitemapName(name: string): SitemapName | undefined {
  if (name === "news.xml") return { kind: "news" };
  const coins = /^coins-([a-z]{2})-(\d{1,4})\.xml$/.exec(name);
  if (coins) return { kind: "coins", locale: coins[1]!, part: Number(coins[2]) };
  const other = /^(pages|markets|articles|campaigns)-([a-z]{2})\.xml$/.exec(name);
  if (other) return { kind: other[1] as "pages", locale: other[2]! };
  return undefined;
}
