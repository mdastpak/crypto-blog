import type { Site } from "@/lib/backend/schemas";
import type { Locale } from "@/i18n/locales";

export interface Alternates {
  /** hreflang → URL, `x-default` included. */
  languages: Record<string, string>;
}

const join = (base: string, locale: string, path: string) =>
  `${base.replace(/\/+$/, "")}/${locale}${path ? `/${path}` : ""}`;

const siteUrl = (site: Site) => site.url ?? `https://${site.domain}`;

/**
 * The hreflang links of a page that exists in `locales`, on this site and
 * every country site (`GET /public/site`): a locale on a site of countries
 * names each country (`fa-IR`), a site without countries the language
 * alone. `x-default` goes to the site without countries (the global one),
 * else this site, in its default locale.
 */
export function hreflangLinks({
  path,
  locales,
  sites,
  ownUrl,
  defaultLocale,
}: {
  /** The path after the locale, without slashes at the ends; empty for the home page. */
  path: string;
  locales: Locale[];
  sites: Site[];
  ownUrl: string;
  defaultLocale: Locale;
}): Alternates {
  const languages: Record<string, string> = {};
  const pick = (preferred: string | undefined, available: string[]) =>
    preferred && available.includes(preferred) ? preferred : available[0];

  const own = new URL(ownUrl).host;
  const listed = sites.filter((s) => s.url || s.domain);
  if (!listed.some((s) => new URL(siteUrl(s)).host === own)) {
    for (const l of locales) languages[l] = join(ownUrl, l, path);
  }
  for (const site of listed) {
    const available = locales.filter((l) => !site.locales?.length || site.locales.includes(l));
    for (const l of available) {
      const countries = site.countries ?? [];
      const codes = countries.length ? countries.map((c) => `${l}-${c.toUpperCase()}`) : [l];
      for (const code of codes) languages[code] = join(siteUrl(site), l, path);
    }
  }

  const global = listed.find((s) => !s.countries?.length);
  if (global) {
    const available = locales.filter((l) => !global.locales?.length || global.locales.includes(l));
    const locale = pick(global.default_locale, available);
    if (locale) languages["x-default"] = join(siteUrl(global), locale, path);
  }
  if (!languages["x-default"]) {
    const locale = pick(defaultLocale, locales);
    if (locale) languages["x-default"] = join(ownUrl, locale, path);
  }
  return { languages };
}
