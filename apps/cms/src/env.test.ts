import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  DATABASE_URL: "postgres://cms@db/cms",
  PAYLOAD_SECRET: "p".repeat(32),
  CMS_PUBLIC_URL: "https://cms.internal.example",
};

describe("parseEnv", () => {
  it("reads a valid environment", () => {
    const env = parseEnv({
      ...valid,
      WEB_REVALIDATE_URLS: "https://a/api/revalidate, https://b/api/revalidate",
      REVALIDATE_SECRET: "r".repeat(32),
    });
    expect(env.WEB_REVALIDATE_URLS).toEqual([
      "https://a/api/revalidate",
      "https://b/api/revalidate",
    ]);
  });

  it("reports every problem at once", () => {
    expect(() => parseEnv({ PAYLOAD_SECRET: "short", CMS_PUBLIC_URL: "cms" })).toThrow(
      /DATABASE_URL[\s\S]*PAYLOAD_SECRET must be at least 32[\s\S]*CMS_PUBLIC_URL/,
    );
  });

  it("needs a strong secret to revalidate", () => {
    expect(() =>
      parseEnv({ ...valid, WEB_REVALIDATE_URLS: "https://a/x", REVALIDATE_SECRET: "short" }),
    ).toThrow(/REVALIDATE_SECRET must be at least 32/);
  });

  it("needs shared media storage in production", () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: "production" })).toThrow(
      /S3_BUCKET is required in production/,
    );
    expect(parseEnv({ ...valid, NODE_ENV: "production", S3_BUCKET: "media" }).S3_BUCKET).toBe(
      "media",
    );
  });

  it("needs no configuration while building", () => {
    expect(parseEnv({ NEXT_PHASE: "phase-production-build" }).DATABASE_URL).toMatch(/^postgres:/);
  });
});
