/**
 * Security headers of the CMS (#29). The admin panel is a Next.js app that
 * needs inline scripts and styles, so its policy allows them, but nothing
 * from other origins: no plugins, no framing of the panel elsewhere, no form
 * posts or base URLs elsewhere. Media files get a stricter policy of their
 * own (mediaResponseHeaders).
 */
export interface HeaderOptions {
  /** `next dev` needs eval and a WebSocket for hot reload. */
  development?: boolean;
  /** HSTS only where the panel is served over HTTPS. */
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
    // The live preview frames the blog (WEB_PREVIEW_URL), which is only
    // known at run time, while these headers are fixed at build time.
    "frame-src": ["'self'", "https:", ...(development ? ["http:"] : [])],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
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
    { key: "Referrer-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
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

/**
 * The policy of a media file opened on its own: a sandbox without scripts,
 * so that no file, whatever its content, runs on the CMS origin.
 */
export const MEDIA_CONTENT_SECURITY_POLICY =
  "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";

/** Adds the media policy to the headers of a file response. */
export function mediaResponseHeaders(headers: Headers): Headers {
  headers.set("Content-Security-Policy", MEDIA_CONTENT_SECURITY_POLICY);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cross-Origin-Resource-Policy", "same-site");
  const type = headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase();
  if (type === "image/svg+xml") headers.set("Content-Disposition", "attachment");
  return headers;
}
