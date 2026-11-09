import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, negotiateLocale } from "@/i18n/negotiate";
import { splitLocale } from "@/i18n/paths";
import { getConfig } from "@/lib/config";
import { checkSite, isCrawler, safeRedirectUrl, VISIT_COOKIE } from "@/lib/sites";

const PRIVATE = "private, no-store";

/**
 * Runs before every page.
 *
 * 1. On the first page view of a visit (no `site_checked` cookie), unless the
 *    visitor is a crawler, it asks the backend which country site the
 *    visitor belongs to (lib/sites.ts) and, when it is another one, redirects
 *    there (302). If the backend cannot answer, the page is served here.
 * 2. A path without a locale (`/coins`) goes to `/{locale}/coins` (307), the
 *    locale chosen by i18n/negotiate.ts.
 *
 * Redirects depend on the visitor, so they are never stored by a shared
 * cache. The localized pages themselves are the same for everyone.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const config = getConfig();
  const { pathname, searchParams } = request.nextUrl;
  const { locale, rest } = splitLocale(pathname);

  const firstView =
    config.siteDetection &&
    request.method === "GET" &&
    !request.cookies.has(VISIT_COOKIE) &&
    !isCrawler(request.headers.get("user-agent"));
  const site = firstView ? await checkSite(request, rest || "/", locale) : undefined;

  const elsewhere = site && safeRedirectUrl(site);
  if (elsewhere) {
    const response = NextResponse.redirect(elsewhere, 302);
    response.headers.set("Cache-Control", PRIVATE);
    return response;
  }

  let response: NextResponse;
  if (locale) {
    response = NextResponse.next();
  } else {
    const chosen = negotiateLocale(
      {
        lang: searchParams.get("lang"),
        cookie: request.cookies.get(LOCALE_COOKIE)?.value,
        siteLocale: site?.locale?.code,
        acceptLanguage: request.headers.get("accept-language"),
      },
      config.locales,
      config.defaultLocale,
    );
    const target = request.nextUrl.clone();
    target.pathname = `/${chosen}${rest}`;
    target.searchParams.delete("lang");
    response = NextResponse.redirect(target, 307);
    response.headers.set("Vary", "Accept-Language, Cookie");
    response.headers.set("Cache-Control", PRIVATE);
  }

  if (firstView) {
    // A session cookie: the check runs again on the next visit.
    response.cookies.set(VISIT_COOKIE, "1", { path: "/", httpOnly: true, sameSite: "lax" });
  }
  return response;
}

export const config = {
  // Every page, but not API routes, Next.js assets, or files with an extension.
  matcher: ["/((?!api/|_next/|.*\\.[^/]+$).*)"],
};
