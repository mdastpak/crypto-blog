import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Checks of what the CMS signs with the shared REVALIDATE_SECRET; the CMS
 * side is apps/cms/src/hooks/signature.ts.
 */

function equal(hex: string, expected: Buffer): boolean {
  if (!/^[0-9a-f]+$/i.test(hex)) return false;
  const given = Buffer.from(hex, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * A revalidation call: `X-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256
 * of "t.body">`, refused when older (or newer) than `toleranceSeconds`, so a
 * captured call cannot be replayed later.
 */
export function verifyWebhook(
  body: string,
  header: string | null,
  secret: string | undefined,
  now = Date.now(),
  toleranceSeconds = 300,
): boolean {
  if (!header || !secret) return false;
  const parts = new Map(
    header.split(",").map((part) => {
      const i = part.indexOf("=");
      return [part.slice(0, i).trim(), part.slice(i + 1).trim()] as const;
    }),
  );
  const t = Number(parts.get("t"));
  const v1 = parts.get("v1");
  if (!Number.isInteger(t) || !v1) return false;
  if (Math.abs(Math.floor(now / 1000) - t) > toleranceSeconds) return false;
  return equal(v1, createHmac("sha256", secret).update(`${t}.${body}`).digest());
}

export interface PreviewTarget {
  collection: string;
  slug: string;
  locale: string;
}

/** A preview link's signature over the document and its expiry (unix seconds). */
export function verifyPreview(
  target: PreviewTarget,
  exp: number,
  sig: string,
  secret: string | undefined,
  now = Date.now(),
): boolean {
  if (!secret || !Number.isInteger(exp) || exp < Math.floor(now / 1000)) return false;
  const message = `preview.${target.collection}.${target.slug}.${target.locale}.${exp}`;
  return equal(sig, createHmac("sha256", secret).update(message).digest());
}
