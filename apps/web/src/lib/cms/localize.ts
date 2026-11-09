import type { Locale } from "@/i18n/locales";
import type { Localized, RichText } from "./schemas";

/**
 * Fallback rules for CMS content (docs/pages.md, "Translations"):
 *
 * - A list in a locale shows only documents whose title is translated into
 *   it, so a list never mixes languages.
 * - A document page shows the requested locale. A document not translated
 *   into it is shown in the first served locale it has, marked with its own
 *   language and direction, a notice, and kept out of search indexes.
 * - Within a translated document, a field not translated yet (often the
 *   body, while a translator works) falls back the same way, field by field.
 * - Only locales this release serves are fallbacks: an international release
 *   that serves only English never shows Persian text.
 */

export interface Picked<T> {
  value: T;
  locale: Locale;
}

/** The locales to try for a page in `locale`: it first, then the other served ones. */
export function fallbackOrder(locale: Locale, served: readonly Locale[]): Locale[] {
  return [locale, ...served.filter((l) => l !== locale)];
}

function present(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "object" && "root" in value) return !isEmptyRichText(value as RichText);
  return true;
}

/** Whether a rich text has no content (Lexical saves one empty paragraph). */
export function isEmptyRichText(value: RichText): boolean {
  const children = value.root.children as { type?: string; children?: unknown[] }[];
  return children.every((node) => node?.type === "paragraph" && !node.children?.length);
}

/** The first translation present in `order`, with its locale. */
export function pick<T>(value: Localized<T>, order: readonly Locale[]): Picked<T> | undefined {
  for (const locale of order) {
    const v = value[locale];
    if (present(v)) return { value: v as T, locale };
  }
  return undefined;
}

/** The text in the first locale of `order` that has one, or undefined. */
export function text(value: Localized<string>, order: readonly Locale[]): string | undefined {
  return pick(value, order)?.value;
}

/**
 * How a CMS document is shown in a page locale (lib/cms/localize.ts): the
 * locale of the document (its title's), and whether it or some of its
 * fields fall back to another locale.
 */
export interface Shown {
  /** The locale of the title, and of the document as a whole. */
  docLocale: Locale;
  /** The fallback order of the document's fields, its own locale first. */
  docOrder: Locale[];
  untranslated: boolean;
  /** Locales the title is translated into, served by this release. */
  translations: Locale[];
}

export function shown(
  title: Localized<string>,
  locale: Locale,
  served: readonly Locale[],
): Shown | undefined {
  const picked = pick(title, fallbackOrder(locale, served));
  if (!picked) return undefined;
  return {
    docLocale: picked.locale,
    docOrder: fallbackOrder(picked.locale, served),
    untranslated: picked.locale !== locale,
    translations: served.filter((l) => !!text(title, [l])),
  };
}
