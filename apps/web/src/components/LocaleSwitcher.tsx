"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOCALE_NAMES, type Locale } from "@/i18n/locales";
import { LOCALE_COOKIE } from "@/i18n/negotiate";
import { localizedPath } from "@/i18n/paths";

const ONE_YEAR = 60 * 60 * 24 * 365;

export interface LocaleSwitcherProps {
  current: Locale;
  locales: readonly Locale[];
  label: string;
}

/**
 * Links to the same page in the other locales. Choosing one saves it in the
 * `locale` cookie, which the backend reads too.
 */
export function LocaleSwitcher({ current, locales, label }: LocaleSwitcherProps) {
  const pathname = usePathname() ?? `/${current}`;
  return (
    <nav aria-label={label} className="flex gap-3 text-sm">
      {locales.map((locale) => (
        <Link
          key={locale}
          href={localizedPath(pathname, locale)}
          hrefLang={locale}
          lang={locale}
          aria-current={locale === current ? "true" : undefined}
          className={
            locale === current ? "font-semibold text-text underline" : "text-muted hover:text-text"
          }
          onClick={() => {
            document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`;
          }}
        >
          {LOCALE_NAMES[locale]}
        </Link>
      ))}
    </nav>
  );
}
