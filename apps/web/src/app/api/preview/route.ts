import { draftMode } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { enabledLocale } from "@/i18n/server";
import { verifyPreview } from "@/lib/cms/signature";
import { getConfig } from "@/lib/config";

/** Where each previewable collection's documents are shown. */
const PATHS: Record<string, string> = { articles: "blog", campaigns: "campaigns" };

/**
 * Opens a draft from the admin panel's Preview link: checks the CMS's
 * signature and expiry, turns on draft mode (a cookie of this browser only),
 * and goes to the document's page. Pages in draft mode read the latest
 * draft with the preview key and are never cached.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { revalidateSecret, cmsPreviewApiKey } = getConfig();
  const q = request.nextUrl.searchParams;
  const target = {
    collection: q.get("collection") ?? "",
    slug: q.get("slug") ?? "",
    locale: q.get("locale") ?? "",
  };
  const section = PATHS[target.collection];
  const locale = enabledLocale(target.locale);
  const valid =
    !!cmsPreviewApiKey &&
    !!section &&
    !!locale &&
    /^[a-z0-9-]{1,120}$/.test(target.slug) &&
    verifyPreview(target, Number(q.get("exp")), q.get("sig") ?? "", revalidateSecret);
  if (!valid) return NextResponse.json({ error: "invalid_preview_link" }, { status: 401 });

  (await draftMode()).enable();
  // A relative Location keeps the visitor on the host they came from,
  // which is the host the draft mode cookie belongs to.
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: `/${locale}/${section}/${target.slug}`,
      "Cache-Control": "private, no-store",
    },
  });
}
