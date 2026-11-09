"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { isAvailableLocale } from "@/i18n/locales";
import { createTranslator } from "@/i18n/translate";

export default function NotFound() {
  const params = useParams<{ locale?: string }>();
  const locale = isAvailableLocale(params?.locale) ? params.locale : "en";
  const t = createTranslator(locale);
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-2xl font-bold">{t("NOT_FOUND_TITLE")}</h1>
      <p className="mt-4 opacity-80">{t("NOT_FOUND_BODY")}</p>
      <Link href={`/${locale}`} className="mt-6 inline-block underline">
        {t("NOT_FOUND_HOME")}
      </Link>
    </main>
  );
}
