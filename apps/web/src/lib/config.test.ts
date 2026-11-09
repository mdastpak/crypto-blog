import { ConfigError, parseConfig } from "./config";

const valid = {
  BACKEND_API_URL: "https://api.example.com/api/v1/",
  PUBLIC_SITE_URL: "https://blog.example.com",
};

function problems(env: Record<string, string | undefined>): string[] {
  try {
    parseConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  throw new Error("expected a ConfigError");
}

describe("sites", () => {
  it("reads the site settings", () => {
    const config = parseConfig({
      ...valid,
      SITE_DETECTION: "false",
      SITE_TIMEOUT_MS: "300",
      TRUST_PROXY_HEADERS: "true",
    });
    expect(config).toMatchObject({
      siteDetection: false,
      siteTimeoutMs: 300,
      trustProxyHeaders: true,
    });
  });

  it("refuses a value that is not a boolean", () => {
    expect(problems({ ...valid, TRUST_PROXY_HEADERS: "yes" })).toEqual([
      "TRUST_PROXY_HEADERS must be true or false",
    ]);
  });
});

describe("brand", () => {
  it("reads BRAND and DESIGN_GALLERY", () => {
    const config = parseConfig({ ...valid, BRAND: " Emerald ", DESIGN_GALLERY: "true" });
    expect(config.brand).toBe("emerald");
    expect(config.designGallery).toBe(true);
  });

  it("refuses an unknown brand", () => {
    expect(problems({ ...valid, BRAND: "nope" })).toEqual([
      "BRAND must be one of: default, emerald",
    ]);
  });
});

describe("locales", () => {
  it("puts English first in an international release", () => {
    const config = parseConfig({ ...valid, DEPLOYMENT_REGION: "international" });
    expect(config.locales).toEqual(["en", "fa"]);
    expect(config.defaultLocale).toBe("en");
  });

  it("reads LOCALES and DEFAULT_LOCALE", () => {
    const config = parseConfig({ ...valid, LOCALES: " EN , fa,en", DEFAULT_LOCALE: "en" });
    expect(config.locales).toEqual(["en", "fa"]);
    expect(config.defaultLocale).toBe("en");
  });

  it("defaults to the first locale when the region's is not served", () => {
    expect(parseConfig({ ...valid, LOCALES: "en" }).defaultLocale).toBe("en");
  });

  it("refuses a locale without a catalog", () => {
    expect(problems({ ...valid, LOCALES: "fa,de" })).toEqual([
      "LOCALES must list locales of this build (fa, en); unknown: de",
    ]);
  });

  it("refuses a default that is not served", () => {
    expect(problems({ ...valid, LOCALES: "fa", DEFAULT_LOCALE: "en" })).toEqual([
      "DEFAULT_LOCALE must be one of LOCALES (fa)",
    ]);
  });
});

describe("parseConfig", () => {
  it("applies defaults and trims trailing slashes", () => {
    expect(parseConfig(valid)).toEqual({
      backendApiUrl: "https://api.example.com/api/v1",
      publicSiteUrl: "https://blog.example.com",
      region: "ir",
      backendTimeoutMs: 5000,
      shutdownDrainSeconds: 10,
      logLevel: "info",
      locales: ["fa", "en"],
      defaultLocale: "fa",
      brand: "default",
      designGallery: false,
      siteDetection: true,
      siteTimeoutMs: 800,
      trustProxyHeaders: false,
    });
  });

  it("reads every setting", () => {
    const config = parseConfig({
      ...valid,
      DEPLOYMENT_REGION: " International ",
      BACKEND_TIMEOUT_MS: "1500",
      SHUTDOWN_DRAIN_SECONDS: "0",
      LOG_LEVEL: "debug",
    });
    expect(config.region).toBe("international");
    expect(config.backendTimeoutMs).toBe(1500);
    expect(config.shutdownDrainSeconds).toBe(0);
    expect(config.logLevel).toBe("debug");
  });

  it("treats empty values as unset", () => {
    expect(parseConfig({ ...valid, DEPLOYMENT_REGION: "", LOG_LEVEL: " " }).region).toBe("ir");
  });

  it("reports every problem at once", () => {
    expect(
      problems({
        PUBLIC_SITE_URL: "ftp://blog.example.com",
        DEPLOYMENT_REGION: "eu",
        BACKEND_TIMEOUT_MS: "-1",
      }),
    ).toEqual([
      "BACKEND_API_URL is required",
      "PUBLIC_SITE_URL must be an absolute http or https URL",
      expect.stringMatching(/^DEPLOYMENT_REGION must be one of: ir, international$/),
      expect.stringMatching(/^BACKEND_TIMEOUT_MS /),
    ]);
  });

  it("rejects a relative URL", () => {
    expect(problems({ ...valid, BACKEND_API_URL: "/api/v1" })).toEqual([
      "BACKEND_API_URL must be an absolute http or https URL",
    ]);
  });

  it("names the problems in the error message", () => {
    expect(() => parseConfig({})).toThrow(/BACKEND_API_URL is required/);
  });
});
