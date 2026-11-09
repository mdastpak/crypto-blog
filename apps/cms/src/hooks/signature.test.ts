import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { previewMessage, previewUrl, sign, verify } from "./signature";

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

describe("preview links", () => {
  it("signs the document and an expiry the web app can check", () => {
    const target = { collection: "articles", slug: "what-is-bitcoin", locale: "en" };
    const url = new URL(previewUrl("https://blog.example.com", target, secret, now));
    expect(url.origin + url.pathname).toBe("https://blog.example.com/api/preview");
    const exp = Number(url.searchParams.get("exp"));
    expect(exp).toBe(now / 1000 + 3600);
    expect(url.searchParams.get("slug")).toBe("what-is-bitcoin");
    const expected = createHmac("sha256", secret).update(previewMessage(target, exp)).digest("hex");
    expect(url.searchParams.get("sig")).toBe(expected);
    expect(previewMessage(target, exp)).toBe(`preview.articles.what-is-bitcoin.en.${exp}`);
  });
});
