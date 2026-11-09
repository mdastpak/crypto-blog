import { isAvailableLocale, type Locale } from "./locales";

/** Splits `/fa/coins/btc` into its locale and the rest (`/coins/btc`). */
export function splitLocale(pathname: string): { locale?: Locale; rest: string } {
  const [, first, ...others] = pathname.split("/");
  if (isAvailableLocale(first)) {
    return { locale: first, rest: others.length ? `/${others.join("/")}` : "" };
  }
  return { rest: pathname === "/" ? "" : pathname };
}

/** The same page in another locale. */
export function localizedPath(pathname: string, locale: Locale): string {
  return `/${locale}${splitLocale(pathname).rest}`;
}
