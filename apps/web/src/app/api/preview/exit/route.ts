import { draftMode } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/** Leaves draft mode and goes back to the page, now as visitors see it. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  (await draftMode()).disable();
  const to = request.nextUrl.searchParams.get("to") ?? "/";
  // Only a path of this site, never another origin.
  const path = to.startsWith("/") && !to.startsWith("//") && !to.includes("\\") ? to : "/";
  return new NextResponse(null, {
    status: 307,
    headers: { Location: path, "Cache-Control": "private, no-store" },
  });
}
