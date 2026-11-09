import { describe, expect, it } from "vitest";
import { sign, verify } from "./signature";

const secret = "s".repeat(32);
const body = JSON.stringify({ tags: ["cms:articles"] });
const now = Date.UTC(2026, 10, 9, 12);

describe("webhook signatures", () => {
  it("verifies its own signature", () => {
    expect(verify(body, sign(body, secret, now), secret, now)).toBe(true);
  });

  it("refuses another body, secret, or a malformed header", () => {
    const header = sign(body, secret, now);
    expect(verify(`${body} `, header, secret, now)).toBe(false);
    expect(verify(body, header, "x".repeat(32), now)).toBe(false);
    expect(verify(body, "v1=abc", secret, now)).toBe(false);
    expect(verify(body, null, secret, now)).toBe(false);
    expect(verify(body, header, "", now)).toBe(false);
  });

  it("refuses an old signature, so a captured request cannot be replayed", () => {
    const header = sign(body, secret, now);
    expect(verify(body, header, secret, now + 299_000)).toBe(true);
    expect(verify(body, header, secret, now + 301_000)).toBe(false);
  });
});
