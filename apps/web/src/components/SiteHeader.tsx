import Link from "next/link";
import type { Brand } from "@/design/brands";
import type { Locale } from "@/i18n/locales";
import { createTranslator } from "@/i18n/translate";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { ThemeSwitcher } from "./ThemeSwitcher";

export interface SiteHeaderProps {
  locale: Locale;
  locales: readonly Locale[];
  brand: Brand;
}

export function SiteHeader({ locale, locales, brand }: SiteHeaderProps) {
  const t = createTranslator(locale);
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href={`/${locale}`} className="flex items-center gap-2 text-lg font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element -- small SVG, no optimization needed */}
          <img src={brand.logo.light} alt="" width={28} height={28} className="dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element -- small SVG, no optimization needed */}
          <img src={brand.logo.dark} alt="" width={28} height={28} className="hidden dark:block" />
          <span>{brand.name[locale]}</span>
        </Link>
        <nav aria-label={t("SITE_NAME")} className="me-auto ms-6 hidden text-sm sm:block">
          <Link href={`/${locale}/coins`} className="text-muted hover:text-text">
            {t("NAV_COINS")}
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          {locales.length > 1 && (
            <LocaleSwitcher current={locale} locales={locales} label={t("LOCALE_SWITCHER_LABEL")} />
          )}
          <ThemeSwitcher
            label={t("THEME_SWITCHER_LABEL")}
            names={{ light: t("THEME_LIGHT"), dark: t("THEME_DARK"), system: t("THEME_SYSTEM") }}
          />
        </div>
      </div>
    </header>
  );
}
