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

describe("parseConfig", () => {
  it("applies defaults and trims trailing slashes", () => {
    expect(parseConfig(valid)).toEqual({
      backendApiUrl: "https://api.example.com/api/v1",
      publicSiteUrl: "https://blog.example.com",
      region: "ir",
      backendTimeoutMs: 5000,
      shutdownDrainSeconds: 10,
      logLevel: "info",
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
