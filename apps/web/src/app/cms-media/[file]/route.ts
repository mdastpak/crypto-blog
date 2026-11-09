import type { NextRequest } from "next/server";
import { MEDIA_FILE } from "@/lib/cms/media";
import { getConfig } from "@/lib/config";

const TYPES = /^image\/(avif|gif|jpeg|png|webp|svg\+xml)$/;

/**
 * Serves a CMS media file to visitors, since the CMS itself is internal.
 * Only plain file names and image types pass; the answer is cached for a
 * day by browsers and any CDN in front. With CMS_MEDIA_URL set, pages link
 * to that CDN instead and this route is unused.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { cmsApiUrl, backendTimeoutMs } = getConfig();
  const { file } = await params;
  if (!cmsApiUrl || !MEDIA_FILE.test(file)) return new Response(null, { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetch(`${cmsApiUrl}/media/file/${encodeURIComponent(file)}`, {
      signal: AbortSignal.timeout(backendTimeoutMs * 2),
      cache: "no-store",
    });
  } catch {
    return new Response(null, { status: 502 });
  }
  const type = upstream.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!upstream.ok || !TYPES.test(type)) {
    return new Response(null, { status: upstream.status === 404 ? 404 : 502 });
  }
  const headers = new Headers({
    "Content-Type": type,
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    "X-Content-Type-Options": "nosniff",
  });
  // SVG can carry script; sandbox it when opened on its own.
  if (type === "image/svg+xml")
    headers.set(
      "Content-Security-Policy",
      "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    );
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(upstream.body, { status: 200, headers });
}
