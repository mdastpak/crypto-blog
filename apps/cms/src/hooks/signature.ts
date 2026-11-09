import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signs a webhook body: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`.
 * The web app verifies it with the shared REVALIDATE_SECRET and refuses old
 * timestamps, so a captured request cannot be replayed later.
 */
export function sign(body: string, secret: string, now = Date.now()): string {
  const t = Math.floor(now / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

/** How long a preview link works, in seconds. */
export const PREVIEW_LINK_SECONDS = 3600;

export interface PreviewTarget {
  collection: string;
  slug: string;
  locale: string;
}

/** The message a preview link signs; the web app builds the same string. */
export function previewMessage(target: PreviewTarget, exp: number): string {
  return `preview.${target.collection}.${target.slug}.${target.locale}.${exp}`;
}

/**
 * A link that turns on the blog's draft mode for one document. It is signed
 * and expires, so only someone who opened it from the admin panel recently
 * can preview, and it reveals nothing else.
 */
export function previewUrl(
  webUrl: string,
  target: PreviewTarget,
  secret: string,
  now = Date.now(),
): string {
  const exp = Math.floor(now / 1000) + PREVIEW_LINK_SECONDS;
  const sig = createHmac("sha256", secret).update(previewMessage(target, exp)).digest("hex");
  const url = new URL("/api/preview", webUrl);
  url.search = new URLSearchParams({ ...target, exp: String(exp), sig }).toString();
  return url.toString();
}

export function verify(
  body: string,
  header: string | null,
  secret: string,
  now = Date.now(),
  toleranceSeconds = 300,
): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) return false;
  if (Math.abs(Math.floor(now / 1000) - t) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest();
  const given = Buffer.from(parts.v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
