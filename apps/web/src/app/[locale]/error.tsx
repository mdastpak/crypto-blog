"use client";

import { useParams } from "next/navigation";
import { Button } from "@/components/ui";
import { isAvailableLocale } from "@/i18n/locales";
import { createTranslator } from "@/i18n/translate";

/** Shown when a page fails to render, such as when the backend is down and nothing is cached. */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ locale?: string }>();
  const t = createTranslator(isAvailableLocale(params?.locale) ? params.locale : "en");
  return (
    <main className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-2xl font-bold">{t("ERROR_TITLE")}</h1>
      <p className="mt-4 text-muted">{t("ERROR_BODY")}</p>
      <Button className="mt-6" onClick={reset}>
        {t("ERROR_RETRY")}
      </Button>
    </main>
  );
}
