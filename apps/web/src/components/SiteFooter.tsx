import type { Brand } from "@/design/brands";
import { formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { createTranslator } from "@/i18n/translate";

export function SiteFooter({ locale, brand }: { locale: Locale; brand: Brand }) {
  const t = createTranslator(locale);
  const year = formatNumber(locale, new Date().getFullYear(), { useGrouping: false });
  return (
    <footer className="mt-16 border-t border-border bg-surface text-sm text-muted">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6">
        <p>{t("FOOTER_NOTE")}</p>
        <p>
          © {year} {brand.name[locale]}
        </p>
      </div>
    </footer>
  );
}
