import "server-only";
import { getConfig } from "@/lib/config";
import { isAvailableLocale, type Locale } from "./locales";

/** The locale of a request, if this release serves it. */
export function enabledLocale(value: string | undefined): Locale | undefined {
  return isAvailableLocale(value) && getConfig().locales.includes(value) ? value : undefined;
}
