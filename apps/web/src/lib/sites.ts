import "server-only";
import type { NextRequest } from "next/server";
import { CircuitBreaker } from "./backend/breaker";
import { BackendClient } from "./backend/client";
import { siteInfoSchema, type SiteInfo } from "./backend/schemas";
import { getConfig } from "./config";

/**
 * Country sites (Crypto-Exchange #285). The backend decides, for a visitor,
 * the site they belong to and its locale: from their explicit choice, the
 * site's countries and GeoIP, and crawler rules. This module asks it once per
 * visit and checks the answer before the proxy redirects.
 */

/** Set after the first check of a visit, so later pages skip the call. */
export const VISIT_COOKIE = "site_checked";

const CRAWLERS =
  /bot\b|crawler|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegrambot|twitterbot|linkedinbot|discordbot|google-inspectiontool|lighthouse/i;

/** Crawlers stay on the site they index (they follow the hreflang links). */
export function isCrawler(userAgent: string | null): boolean {
  return !!userAgent && CRAWLERS.test(userAgent);
}

// The cookies the backend reads for the choice of site and locale; no other
// cookie of the visitor is sent.
const CHOICE_COOKIES = ["site", "locale"];

/**
 * The headers of the visitor that the backend needs to decide: the origin
 * the visitor is on, the choice cookies, languages, user agent, and, only
 * behind a trusted load balancer, the address chain.
 */
export function forwardedHeaders(
  request: NextRequest,
  trustProxy: boolean,
  locale?: string,
): Record<string, string> {
  const headers: Record<string, string> = {};
  const host =
    (trustProxy && request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()) ||
    request.headers.get("host") ||
    request.nextUrl.host;
  const proto =
    (trustProxy && request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()) ||
    request.nextUrl.protocol.replace(":", "");
  headers.Origin = `${proto}://${host}`;

  const cookies = CHOICE_COOKIES.flatMap((name) => {
    const value = request.cookies.get(name)?.value;
    return value ? [`${name}=${value}`] : [];
  });
  if (cookies.length) headers.Cookie = cookies.join("; ");

  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage) headers["Accept-Language"] = acceptLanguage;
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers["User-Agent"] = userAgent;
  if (locale) headers["X-Locale"] = locale;

  if (trustProxy) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) headers["X-Forwarded-For"] = forwardedFor;
  }
  return headers;
}

/**
 * The redirect target of an answer, only if it is an http(s) URL on the
 * domain of one of the sites the backend listed. The backend already
 * refuses open redirects; this is a second check, so that a wrong answer
 * can never send a visitor off the product's domains.
 */
export function safeRedirectUrl(info: SiteInfo): string | undefined {
  const target = info.redirect?.needed ? info.redirect.url : undefined;
  if (!target) return undefined;
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (url.username || url.password) return undefined;
  const domains = new Set(
    [...(info.sites ?? []), ...(info.site ? [info.site] : [])].map((s) => s.domain.toLowerCase()),
  );
  return domains.has(url.hostname.toLowerCase()) ? url.toString() : undefined;
}

const KEY = Symbol.for("crypto-blog.sites-client");
const store = globalThis as typeof globalThis & { [KEY]?: BackendClient };

function client(): BackendClient {
  if (!store[KEY]) {
    const config = getConfig();
    // No retries: this runs before the page, and failing open is better
    // than holding the visitor.
    store[KEY] = new BackendClient({
      baseUrl: config.backendApiUrl,
      timeoutMs: config.siteTimeoutMs,
      retries: 0,
      breaker: new CircuitBreaker(5, 30_000),
    });
  }
  return store[KEY];
}

/** Asks the backend for the visitor's site; undefined when it cannot answer. */
export async function checkSite(
  request: NextRequest,
  path: string,
  locale?: string,
): Promise<SiteInfo | undefined> {
  const { trustProxyHeaders } = getConfig();
  try {
    return await client().get("/public/site", siteInfoSchema, {
      query: { path: path || "/" },
      headers: forwardedHeaders(request, trustProxyHeaders, locale),
      revalidate: 0,
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "site check failed, serving the page on this host",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return undefined;
  }
}
