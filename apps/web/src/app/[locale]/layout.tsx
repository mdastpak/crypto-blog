import "@fontsource-variable/inter";
import "@fontsource-variable/vazirmatn";
import "../globals.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { brandCss, getBrand } from "@/design/brands";
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
  const brand = getBrand(getConfig().brand);
  const name = brand.name[locale];
  return {
    title: { default: name, template: `%s | ${name}` },
    description: t("SITE_DESCRIPTION"),
    icons: { icon: brand.favicon },
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
  const { brand: brandId, locales, cmsApiUrl } = getConfig();
  const brand = getBrand(brandId);
  return (
    // The theme script sets data-theme before React hydrates.
    <html lang={locale} dir={textDirection(locale)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* The brand's color tokens, light and dark (design/brands.ts). */}
        <style dangerouslySetInnerHTML={{ __html: brandCss(brand) }} />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2"
        >
          {t("NAV_SKIP_TO_CONTENT")}
        </a>
        <SiteHeader locale={locale} locales={locales} brand={brand} editorial={!!cmsApiUrl} />
        <div id="content" className="flex-1">
          {children}
        </div>
        <SiteFooter locale={locale} brand={brand} />
      </body>
    </html>
  );
}
