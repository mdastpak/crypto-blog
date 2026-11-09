import "server-only";
import { notFound } from "next/navigation";
import type { Locale } from "@/i18n/locales";
import { enabledLocale } from "@/i18n/server";
import { createTranslator, type Translate } from "@/i18n/translate";
import { cmsEnabled, fallbackOrder } from "@/lib/cms";
import { getConfig } from "@/lib/config";

export interface EditorialContext {
  locale: Locale;
  t: Translate;
  /** Fallback locales for related names, the page's locale first. */
  order: Locale[];
  served: Locale[];
  mediaBase?: string;
}

/** The context of an editorial page; 404 for a locale not served or without a CMS. */
export function editorialContext(raw: string): EditorialContext {
  const locale = enabledLocale(raw);
  if (!locale || !cmsEnabled()) notFound();
  const { locales, cmsMediaUrl } = getConfig();
  return {
    locale,
    t: createTranslator(locale),
    order: fallbackOrder(locale, locales),
    served: locales,
    mediaBase: cmsMediaUrl,
  };
}

/** Same as editorialContext, but undefined instead of a 404 (for metadata). */
export function maybeEditorialContext(raw: string): EditorialContext | undefined {
  const locale = enabledLocale(raw);
  if (!locale || !cmsEnabled()) return undefined;
  return editorialContext(raw);
}
