import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, negotiateLocale } from "@/i18n/negotiate";
import { splitLocale } from "@/i18n/paths";
import { createTranslator } from "@/i18n/translate";
import { getConfig } from "@/lib/config";
import { catalogCopy } from "@/lib/seo/catalog";
import { checkSite, isCrawler, safeRedirectUrl, VISIT_COOKIE } from "@/lib/sites";
import type { Locale } from "@/i18n/locales";

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
 * 3. A coin an administrator removed from the catalog answers 410 Gone, so
 *    search engines drop it (lib/seo/catalog.ts).
 *
 * Redirects depend on the visitor, so they are never stored by a shared
 * cache. The localized pages themselves are the same for everyone.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const config = getConfig();
  const { pathname, searchParams } = request.nextUrl;
  const { locale, rest } = splitLocale(pathname);

  const coin = locale && /^\/coins\/([^/]+)$/.exec(rest)?.[1];
  if (locale && coin && catalogCopy()?.isRemoved(decodeURIComponent(coin))) return gone(locale);

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

/** A small page for a removed coin, with the status that tells crawlers it is gone for good. */
function gone(locale: Locale): NextResponse {
  const t = createTranslator(locale);
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const html = `<!doctype html><html lang="${locale}" dir="${locale === "fa" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escape(t("COIN_GONE_TITLE"))}</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem"><h1>${escape(t("COIN_GONE_TITLE"))}</h1><p>${escape(t("COIN_GONE_TEXT"))}</p><p><a href="/${locale}/coins">${escape(t("NAV_COINS"))}</a></p></body></html>`;
  return new NextResponse(html, {
    status: 410,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}

export const config = {
  // Every page, but not API routes, Next.js assets, or files with an extension.
  matcher: ["/((?!api/|_next/|og/|sitemaps/|.*\\.[^/]+$).*)"],
};
