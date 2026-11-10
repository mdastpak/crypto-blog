import {
  contentSecurityPolicy,
  imageOriginAllowed,
  imageOrigins,
  securityHeaders,
} from "./headers";

describe("security headers", () => {
  it("closes everything but this origin's and inline scripts in production", () => {
    const csp = contentSecurityPolicy();
    expect(csp).toContain("script-src 'self' 'unsafe-inline';");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self';");
    expect(csp).toMatch(/upgrade-insecure-requests$/);
  });

  it("allows hot reload in development", () => {
    const csp = contentSecurityPolicy({ development: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
  });

  it("sends HSTS only in production when enabled", () => {
    const names = (h: { key: string }[]) => h.map((x) => x.key);
    expect(names(securityHeaders({ hsts: true }))).toContain("Strict-Transport-Security");
    expect(names(securityHeaders({ hsts: false }))).not.toContain("Strict-Transport-Security");
    expect(names(securityHeaders({ hsts: true, development: true }))).not.toContain(
      "Strict-Transport-Security",
    );
    expect(names(securityHeaders({}))).toEqual(
      expect.arrayContaining(["X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options"]),
    );
  });

  it("allows images from this origin and the media CDN only", () => {
    expect(contentSecurityPolicy()).toContain("img-src 'self' data: blob:;");
    expect(contentSecurityPolicy()).toContain("media-src 'self';");
    expect(contentSecurityPolicy()).not.toMatch(/https:[;\s]/);
    expect(
      contentSecurityPolicy({ imageOrigins: imageOrigins("https://media.example/cms/") }),
    ).toContain("img-src 'self' data: blob: https://media.example;");
  });

  it("refuses a media CDN the build did not allow", () => {
    expect(imageOriginAllowed(undefined, [])).toBe(true);
    expect(imageOriginAllowed("https://media.example/x", ["https://media.example"])).toBe(true);
    expect(imageOriginAllowed("https://other.example", ["https://media.example"])).toBe(false);
  });
});
