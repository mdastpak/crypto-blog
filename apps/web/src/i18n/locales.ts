/**
 * The locales this build has catalogs for. A release enables some of them
 * with LOCALES (see lib/config.ts); a new language adds its catalog here.
 */
export const AVAILABLE_LOCALES = ["fa", "en"] as const;
export type Locale = (typeof AVAILABLE_LOCALES)[number];

export type Direction = "rtl" | "ltr";

export function isAvailableLocale(value: string | undefined): value is Locale {
  return (AVAILABLE_LOCALES as readonly string[]).includes(value ?? "");
}

// Scripts written right to left, the same list as the backend (docs/i18n.md).
const RTL_SCRIPTS = new Set([
  "Arab",
  "Hebr",
  "Thaa",
  "Syrc",
  "Nkoo",
  "Adlm",
  "Rohg",
  "Mand",
  "Samr",
  "Mend",
]);

/**
 * The direction of a language tag, from the script it is written in:
 * `fa`, `ar`, `he`, `ur`, `az-Arab` are RTL; `en`, `az` are LTR.
 */
export function textDirection(tag: string): Direction {
  try {
    const script = new Intl.Locale(tag).maximize().script;
    return script && RTL_SCRIPTS.has(script) ? "rtl" : "ltr";
  } catch {
    return "ltr";
  }
}

/**
 * The BCP 47 tag used for Intl formatting. Persian uses `fa-IR`, so that
 * numbers use Persian digits and separators.
 */
export function intlTag(locale: Locale): string {
  return locale === "fa" ? "fa-IR" : locale;
}

/** The name of each locale in its own language, for the switcher. */
export const LOCALE_NAMES: Record<Locale, string> = {
  fa: "فارسی",
  en: "English",
};
