import "server-only";
import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { mediaUrl, type Media, type Shown } from "@/lib/cms";
import { getConfig } from "@/lib/config";
import { pageMetadata } from "@/lib/seo/metadata";

export async function isPreview(): Promise<boolean> {
  return (await draftMode()).isEnabled;
}

/**
 * Metadata of a document page: canonical and hreflang links (only to the
 * languages it is translated into), Open Graph, and indexing.
 */
export async function documentMetadata({
  path,
  view,
  title,
  description,
  image,
  preview,
  article,
}: {
  /** The path after the locale, e.g. `blog/what-is-bitcoin`. */
  path: string;
  view: Shown;
  title: string;
  description?: string;
  image?: Media;
  preview: boolean;
  article?: { publishedTime?: string; modifiedTime?: string; section?: string };
}): Promise<Metadata> {
  const og = mediaUrl(image, "og", getConfig().cmsMediaUrl);
  return pageMetadata({
    locale: view.docLocale,
    path,
    title,
    description,
    locales: view.translations,
    // A page shown in a fallback language points search engines to the original.
    canonicalLocale: view.docLocale,
    image: og ? { url: og.src, width: og.width, height: og.height } : undefined,
    noindex: view.untranslated || preview,
    article,
  });
}
