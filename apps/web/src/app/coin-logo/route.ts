import type { NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { allowedLogoUrl, LOGO_TYPES, MAX_LOGO_BYTES } from "@/lib/market/logos";

/** How long a fetched logo is kept before it is fetched again, in seconds. */
const LOGO_REVALIDATE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Serves a coin logo from an allowed host (lib/market/logos.ts). The fetch
 * goes through Next.js's data cache, which every node shares, and is
 * refreshed weekly; while a refresh fails, the stored copy is served. The
 * answer is cached by browsers and any CDN in front for a day.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { coinLogoHosts, backendTimeoutMs } = getConfig();
  const source = allowedLogoUrl(request.nextUrl.searchParams.get("u"), coinLogoHosts);
  if (!source) return new Response(null, { status: 404 });

  let body: ArrayBuffer;
  let type: string;
  try {
    const upstream = await fetch(source, {
      // A redirect could lead to any host.
      redirect: "error",
      // No cookies or referrer: the source learns nothing about visitors.
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(backendTimeoutMs * 2),
      next: { revalidate: LOGO_REVALIDATE_SECONDS, tags: ["coin-logo"] },
    });
    type = upstream.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    const length = Number(upstream.headers.get("content-length") ?? 0);
    if (!upstream.ok || !LOGO_TYPES.includes(type) || length > MAX_LOGO_BYTES) {
      return new Response(null, { status: upstream.status === 404 ? 404 : 502 });
    }
    body = await upstream.arrayBuffer();
  } catch {
    return new Response(null, { status: 502 });
  }
  if (body.byteLength === 0 || body.byteLength > MAX_LOGO_BYTES) {
    return new Response(null, { status: 502 });
  }
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
