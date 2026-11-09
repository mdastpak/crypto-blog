import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { getBrand } from "@/design/brands";
import { enabledLocale } from "@/i18n/server";
import { createTranslator } from "@/i18n/translate";
import { getConfig } from "@/lib/config";
import { organization, website } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const locale = enabledLocale((await params).locale);
  if (!locale) return {};
  const t = createTranslator(locale);
  const brand = getBrand(getConfig().brand);
  return pageMetadata({
    locale,
    path: "",
    // The layout's title template would repeat the brand.
    title: brand.name[locale],
    absoluteTitle: true,
    description: t("SITE_DESCRIPTION"),
  });
}

export default async function HomePage({ params }: { params: Params }) {
  const locale = enabledLocale((await params).locale);
  if (!locale) notFound();
  const t = createTranslator(locale);
  const { publicSiteUrl, brand: brandId } = getConfig();
  const brand = getBrand(brandId);
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <JsonLd
        data={[
          organization({ name: brand.name[locale], url: publicSiteUrl, logo: brand.logo.light }),
          website({ name: brand.name[locale], url: publicSiteUrl, locale }),
        ]}
      />
      <h1 className="text-3xl font-bold">{t("HOME_TITLE")}</h1>
      <p className="mt-4 max-w-prose text-lg opacity-80">{t("HOME_INTRO")}</p>
    </main>
  );
}
