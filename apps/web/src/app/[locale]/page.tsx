import { notFound } from "next/navigation";
import { enabledLocale } from "@/i18n/server";
import { createTranslator } from "@/i18n/translate";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = enabledLocale((await params).locale);
  if (!locale) notFound();
  const t = createTranslator(locale);
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-3xl font-bold">{t("HOME_TITLE")}</h1>
      <p className="mt-4 max-w-prose text-lg opacity-80">{t("HOME_INTRO")}</p>
    </main>
  );
}
