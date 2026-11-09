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
