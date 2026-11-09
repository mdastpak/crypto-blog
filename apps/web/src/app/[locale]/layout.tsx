import "@fontsource-variable/inter";
import "@fontsource-variable/vazirmatn";
import "../globals.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { textDirection } from "@/i18n/locales";
import { enabledLocale } from "@/i18n/server";
import { getConfig } from "@/lib/config";
import { createTranslator } from "@/i18n/translate";
import { THEME_INIT_SCRIPT } from "@/theme/theme";

// Nothing is rendered at build time, which has no configuration: each page
// renders on its first request and is then cached and served statically.
export function generateStaticParams(): { locale: string }[] {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = enabledLocale((await params).locale);
  if (!locale) return {};
  const t = createTranslator(locale);
  return {
    title: { default: t("SITE_NAME"), template: `%s | ${t("SITE_NAME")}` },
    description: t("SITE_DESCRIPTION"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = enabledLocale((await params).locale);
  if (!locale) notFound();
  const t = createTranslator(locale);
  return (
    // The theme script sets data-theme before React hydrates.
    <html lang={locale} dir={textDirection(locale)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2"
        >
          {t("NAV_SKIP_TO_CONTENT")}
        </a>
        <SiteHeader locale={locale} locales={getConfig().locales} />
        <div id="content">{children}</div>
      </body>
    </html>
  );
}
