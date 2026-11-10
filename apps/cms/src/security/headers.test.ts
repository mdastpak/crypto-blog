import { describe, expect, it } from "vitest";
import { MEDIA_MIME_TYPES } from "../collections/Media";
import {
  contentSecurityPolicy,
  MEDIA_CONTENT_SECURITY_POLICY,
  mediaResponseHeaders,
  securityHeaders,
} from "./headers";

describe("CMS security headers (#29)", () => {
  it("closes other origins, plugins, and framing of the panel", () => {
    const csp = contentSecurityPolicy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline';");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it("sends nosniff, no framing, and HSTS only in production", () => {
    const keys = (h: { key: string }[]) => h.map((x) => x.key);
    expect(keys(securityHeaders({ hsts: true }))).toEqual(
      expect.arrayContaining([
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Strict-Transport-Security",
      ]),
    );
    expect(keys(securityHeaders({ hsts: true, development: true }))).not.toContain(
      "Strict-Transport-Security",
    );
  });
});

describe("media (#29)", () => {
  it("accepts raster images only", () => {
    expect(MEDIA_MIME_TYPES).not.toContain("image/svg+xml");
    expect(MEDIA_MIME_TYPES.every((t) => /^image\/(png|jpeg|webp|avif)$/.test(t))).toBe(true);
  });

  it("serves every file in a sandbox without scripts", () => {
    const headers = mediaResponseHeaders(new Headers({ "Content-Type": "image/png" }));
    expect(headers.get("Content-Security-Policy")).toBe(MEDIA_CONTENT_SECURITY_POLICY);
    expect(MEDIA_CONTENT_SECURITY_POLICY).toMatch(/^sandbox;/);
    expect(MEDIA_CONTENT_SECURITY_POLICY).not.toContain("script-src");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Content-Disposition")).toBeNull();
  });

  it("downloads an SVG stored before the rule instead of showing it", () => {
    const headers = mediaResponseHeaders(
      new Headers({ "Content-Type": "image/svg+xml; charset=utf-8" }),
    );
    expect(headers.get("Content-Disposition")).toBe("attachment");
  });
});
