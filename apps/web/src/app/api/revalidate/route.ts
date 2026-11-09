import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { isCmsTag } from "@/lib/cms/tags";
import { verifyWebhook } from "@/lib/cms/signature";
import { invalidateTags } from "@/lib/cache/shared";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/log";

const MAX_BODY = 16 * 1024;
const MAX_TAGS = 50;

/**
 * The CMS's publish webhook (docs/cms.md). It accepts only a body signed
 * with REVALIDATE_SECRET in the last five minutes, and only `cms:` tags, and
 * expires those cache entries at once: the next request renders them anew.
 *
 * The expiry is a mark in the shared cache (lib/cache), which every node
 * reads, so the call may reach any node. When the mark cannot be written the
 * answer is 503, and the CMS tries again; marking twice is harmless.
 *
 * Off (404) without REVALIDATE_SECRET.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { revalidateSecret } = getConfig();
  if (!revalidateSecret) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const body = await request.text();
  if (body.length > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });

  if (!verifyWebhook(body, request.headers.get("x-signature"), revalidateSecret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let tags: unknown;
  try {
    tags = (JSON.parse(body) as { tags?: unknown }).tags;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (
    !Array.isArray(tags) ||
    tags.length === 0 ||
    tags.length > MAX_TAGS ||
    !tags.every(isCmsTag)
  ) {
    return NextResponse.json({ error: "invalid_tags" }, { status: 400 });
  }
  const unique = [...new Set(tags)];
  try {
    await invalidateTags(unique);
  } catch (error) {
    logger.error("revalidation not stored", { error, tags: unique });
    return NextResponse.json({ error: "cache_unavailable" }, { status: 503 });
  }
  for (const tag of unique) revalidateTag(tag, { expire: 0 });
  logger.info("revalidated", { tags: unique });
  return NextResponse.json({ revalidated: tags });
}
