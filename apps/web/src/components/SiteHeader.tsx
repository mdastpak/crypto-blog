import Link from "next/link";
import type { Locale } from "@/i18n/locales";
import { createTranslator } from "@/i18n/translate";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { ThemeSwitcher } from "./ThemeSwitcher";

export function SiteHeader({ locale, locales }: { locale: Locale; locales: readonly Locale[] }) {
  const t = createTranslator(locale);
  return (
    <header className="border-b border-current/10">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href={`/${locale}`} className="text-lg font-bold">
          {t("SITE_NAME")}
        </Link>
        <div className="flex items-center gap-4">
          <LocaleSwitcher current={locale} locales={locales} label={t("LOCALE_SWITCHER_LABEL")} />
          <ThemeSwitcher
            label={t("THEME_SWITCHER_LABEL")}
            names={{ light: t("THEME_LIGHT"), dark: t("THEME_DARK"), system: t("THEME_SYSTEM") }}
          />
        </div>
      </div>
    </header>
  );
}
