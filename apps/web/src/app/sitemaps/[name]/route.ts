import { parseSitemapName } from "@/lib/seo/sitemap";
import { buildSitemap } from "@/lib/seo/sitemaps-server";

export const dynamic = "force-dynamic";

/** One sitemap file: `pages-fa.xml`, `coins-en-0.xml`, `articles-fa.xml`, `news.xml`. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const name = parseSitemapName((await params).name);
  const body = name && (await buildSitemap(name));
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // News changes faster than the rest.
      "Cache-Control": `public, max-age=0, s-maxage=${name.kind === "news" ? 300 : 900}`,
    },
  });
}
