import { buildIndex } from "@/lib/seo/sitemaps-server";

// Built per request from cached data (catalog copy, CMS, backend).
export const dynamic = "force-dynamic";

/** The sitemap index: one file per type and locale (docs/seo.md). */
export async function GET(): Promise<Response> {
  return new Response(await buildIndex(), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=900",
    },
  });
}
