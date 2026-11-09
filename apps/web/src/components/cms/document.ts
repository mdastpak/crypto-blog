import "server-only";
import type { Metadata } from "next";
import { draftMode } from "next/headers";
import type { Locale } from "@/i18n/locales";
import { mediaUrl, type Media, type Shown } from "@/lib/cms";
import { getConfig } from "@/lib/config";

export async function isPreview(): Promise<boolean> {
  return (await draftMode()).isEnabled;
}

/** Metadata of a document page: canonical and hreflang links, and indexing. */
export function documentMetadata({
  path,
  view,
  title,
  description,
  image,
  preview,
}: {
  /** The path after the locale, e.g. `blog/what-is-bitcoin`. */
  path: string;
  view: Shown;
  title: string;
  description?: string;
  image?: Media;
  preview: boolean;
}): Metadata {
  const { publicSiteUrl, cmsMediaUrl } = getConfig();
  const og = mediaUrl(image, "og", cmsMediaUrl);
  const url = (l: Locale) => `${publicSiteUrl}/${l}/${path}`;
  return {
    title,
    description,
    alternates: {
      // A page shown in a fallback language points search engines to the original.
      canonical: url(view.docLocale),
      languages: Object.fromEntries(view.translations.map((l) => [l, url(l)])),
    },
    robots: view.untranslated || preview ? { index: false, follow: true } : undefined,
    openGraph: {
      title,
      description,
      url: url(view.docLocale),
      locale: view.docLocale,
      images: og
        ? [
            {
              url: og.src.startsWith("/") ? `${publicSiteUrl}${og.src}` : og.src,
              width: og.width,
              height: og.height,
            },
          ]
        : undefined,
    },
  };
}
