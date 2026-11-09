/**
 * Security headers of every response (next.config.ts, docs/deployment.md).
 *
 * The Content-Security-Policy allows scripts from this origin and inline
 * scripts, but no others: Next.js streams each page's data in inline
 * scripts, and a nonce would make every page render per request, which
 * the shared page cache exists to avoid. Text from the CMS and the backend
 * is escaped by React, and JSON-LD by serializeJsonLd, so no inline script
 * carries outside text. Everything else is closed: no plugins, no frames
 * of the blog on other sites, no form posts or base URLs elsewhere.
 *
 * Images may come from any HTTPS host: coin logos are third-party.
 */
export interface HeaderOptions {
  /** `next dev` needs eval and a WebSocket for hot reload. */
  development?: boolean;
  /** HSTS only where every host of the site is HTTPS. */
  hsts?: boolean;
}

export function contentSecurityPolicy({ development = false }: HeaderOptions = {}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(development ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(development ? ["ws:", "wss:"] : [])],
    "media-src": ["'self'", "https:"],
    "frame-src": ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "manifest-src": ["'self'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!development) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export function securityHeaders(
  options: HeaderOptions = {
    development: process.env.NODE_ENV !== "production",
    hsts: process.env.HSTS !== "false",
  },
): { key: string; value: string }[] {
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (options.hsts && !options.development) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }
  return headers;
}
