import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { LOCALE_COOKIE, negotiateLocale } from "@/i18n/negotiate";
import { splitLocale } from "@/i18n/paths";

/**
 * Puts every page under a locale prefix.
 *
 * - `/coins` goes to `/{locale}/coins` with a 307, the locale negotiated from
 *   the `locale` cookie, then Accept-Language, then the release default.
 *   The redirect varies by those inputs and is never cached by a shared
 *   cache, so one visitor's language is never served to another.
 * - A locale this release does not enable answers the 404 page (the layout).
 *
 * Country sites and GeoIP redirects come from the backend (#3) and run
 * before this choice.
 */
export function proxy(request: NextRequest): NextResponse {
  const { locales, defaultLocale } = getConfig();
  const { pathname, search } = request.nextUrl;
  const { locale, rest } = splitLocale(pathname);

  if (locale) return NextResponse.next();

  const chosen = negotiateLocale(
    {
      cookie: request.cookies.get(LOCALE_COOKIE)?.value,
      acceptLanguage: request.headers.get("accept-language"),
    },
    locales,
    defaultLocale,
  );
  const target = new URL(`/${chosen}${rest}${search}`, request.url);
  const response = NextResponse.redirect(target, 307);
  response.headers.set("Vary", "Accept-Language, Cookie");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // Every page, but not API routes, Next.js assets, or files with an extension.
  matcher: ["/((?!api/|_next/|.*\\.[^/]+$).*)"],
};
