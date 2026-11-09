import type { Locale } from "./locales";

export const LOCALE_COOKIE = "locale";

interface Candidate {
  tag: string;
  q: number;
  order: number;
}

/** Parses an Accept-Language header into tags, best first. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  const candidates: Candidate[] = [];
  header.split(",").forEach((part, order) => {
    const [rawTag, ...params] = part.trim().split(";");
    const tag = rawTag?.trim();
    if (!tag || tag === "*") return;
    let q = 1;
    for (const param of params) {
      const [name, value] = param.trim().split("=");
      if (name === "q") q = Number(value);
    }
    if (Number.isFinite(q) && q > 0 && q <= 1) candidates.push({ tag, q, order });
  });
  return candidates.sort((a, b) => b.q - a.q || a.order - b.order).map((c) => c.tag);
}

/**
 * The enabled locale a tag names: its exact match, or the locale of its
 * language when its region is not listed (`fa-AF` finds `fa`).
 */
export function matchLocale(tag: string, enabled: readonly Locale[]): Locale | undefined {
  const lower = tag.toLowerCase();
  const exact = enabled.find((l) => l === lower);
  if (exact) return exact;
  const language = lower.split(/[-_]/)[0];
  return enabled.find((l) => l === language);
}

export interface NegotiationInput {
  /** `?lang=`: the locale a redirect from another site carries. */
  lang?: string | null | undefined;
  cookie?: string | undefined;
  /** The locale the backend chose for the visitor's site. */
  siteLocale?: string | undefined;
  acceptLanguage?: string | null | undefined;
}

/**
 * Chooses the locale of a visitor without one in the URL: the `lang`
 * parameter of a redirect from another site (cookies do not cross domains),
 * the switcher's choice (the `locale` cookie, shared with the backend), the
 * locale the backend chose for the visitor's site, the browser's languages,
 * then the release default. A value that names no enabled locale is
 * skipped, never an error.
 */
export function negotiateLocale(
  input: NegotiationInput,
  enabled: readonly Locale[],
  defaultLocale: Locale,
): Locale {
  for (const explicit of [input.lang, input.cookie, input.siteLocale]) {
    const match = explicit ? matchLocale(explicit, enabled) : undefined;
    if (match) return match;
  }
  for (const tag of parseAcceptLanguage(input.acceptLanguage)) {
    const match = matchLocale(tag, enabled);
    if (match) return match;
  }
  return defaultLocale;
}
