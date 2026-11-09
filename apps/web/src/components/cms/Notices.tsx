import { textDirection, type Locale } from "@/i18n/locales";
import { createTranslator, type MessageKey } from "@/i18n/translate";

const LANGUAGE: Record<Locale, MessageKey> = { fa: "LANGUAGE_FA", en: "LANGUAGE_EN" };

/** Says that a page, or parts of it, are shown in another language. */
export function TranslationNotice({
  locale,
  original,
  partial,
}: {
  locale: Locale;
  original: Locale;
  partial: boolean;
}) {
  const t = createTranslator(locale);
  const message = partial
    ? t("CONTENT_PART_NOT_TRANSLATED", { original: t(LANGUAGE[original]) })
    : t("CONTENT_NOT_TRANSLATED", {
        language: t(LANGUAGE[locale]),
        original: t(LANGUAGE[original]),
      });
  return (
    <p role="note" className="rounded-card border border-info/40 p-3 text-sm">
      {message}
    </p>
  );
}

/** Shown on a page in draft mode, with a way out. */
export function PreviewBanner({ locale, path }: { locale: Locale; path: string }) {
  const t = createTranslator(locale);
  return (
    <div role="status" className="border-b border-warning/40 bg-surface-muted">
      <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
        <span>{t("PREVIEW_BANNER")}</span>
        <a href={`/api/preview/exit?to=${encodeURIComponent(path)}`} className="underline">
          {t("PREVIEW_EXIT")}
        </a>
      </p>
    </div>
  );
}

/** `lang` and `dir` for content in `content` shown on a page in `page`. */
export function langAttributes(content: Locale, page: Locale) {
  return content === page ? {} : { lang: content, dir: textDirection(content) };
}
