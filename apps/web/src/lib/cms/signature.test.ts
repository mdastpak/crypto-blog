import { previewUrl, sign } from "../../../../cms/src/hooks/signature";
import { verifyPreview, verifyWebhook } from "./signature";

// Signed by the CMS's own code, so the two sides cannot drift apart.
const secret = "s".repeat(32);
const now = Date.UTC(2026, 10, 9, 12);
const body = JSON.stringify({ tags: ["cms:articles", "cms:articles:a"] });

describe("revalidation webhook", () => {
  it("accepts the CMS's signature", () => {
    expect(verifyWebhook(body, sign(body, secret, now), secret, now)).toBe(true);
  });

  it("refuses another body, a wrong secret, no secret, and junk", () => {
    const header = sign(body, secret, now);
    expect(verifyWebhook(`${body}x`, header, secret, now)).toBe(false);
    expect(verifyWebhook(body, header, "x".repeat(32), now)).toBe(false);
    expect(verifyWebhook(body, header, undefined, now)).toBe(false);
    expect(verifyWebhook(body, null, secret, now)).toBe(false);
    expect(verifyWebhook(body, "t=abc,v1=zz", secret, now)).toBe(false);
    expect(verifyWebhook(body, header.replace(/v1=../, "v1=zz"), secret, now)).toBe(false);
  });

  it("refuses a replay after five minutes", () => {
    const header = sign(body, secret, now);
    expect(verifyWebhook(body, header, secret, now + 299_000)).toBe(true);
    expect(verifyWebhook(body, header, secret, now + 301_000)).toBe(false);
  });
});

describe("preview links", () => {
  const target = { collection: "articles", slug: "a", locale: "en" };
  const link = new URL(previewUrl("https://blog.example.com", target, secret, now));
  const exp = Number(link.searchParams.get("exp"));
  const sig = link.searchParams.get("sig")!;

  it("accepts the CMS's link until it expires", () => {
    expect(verifyPreview(target, exp, sig, secret, now)).toBe(true);
    expect(verifyPreview(target, exp, sig, secret, now + 3_601_000)).toBe(false);
  });

  it("refuses the link for another document or locale", () => {
    expect(verifyPreview({ ...target, slug: "b" }, exp, sig, secret, now)).toBe(false);
    expect(verifyPreview({ ...target, locale: "fa" }, exp, sig, secret, now)).toBe(false);
    expect(verifyPreview(target, exp + 1, sig, secret, now)).toBe(false);
    expect(verifyPreview(target, exp, sig, undefined, now)).toBe(false);
  });
});
