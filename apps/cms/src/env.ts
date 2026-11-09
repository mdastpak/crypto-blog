import { z } from "zod";

const url = z.url({ protocol: /^https?$/, error: "must be an absolute http or https URL" });

const schema = z
  .object({
    DATABASE_URL: z.string().min(1, "is required"),
    PAYLOAD_SECRET: z.string().min(32, "must be at least 32 characters"),
    CMS_PUBLIC_URL: url,
    // One or more web deployments (comma-separated) to revalidate on publish.
    WEB_REVALIDATE_URLS: z
      .string()
      .default("")
      .transform((v) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
      .pipe(z.array(url)),
    REVALIDATE_SECRET: z.string().default(""),
    S3_BUCKET: z.string().default(""),
    S3_REGION: z.string().default("us-east-1"),
    S3_ENDPOINT: z.string().default(""),
    S3_ACCESS_KEY_ID: z.string().default(""),
    S3_SECRET_ACCESS_KEY: z.string().default(""),
    NODE_ENV: z.string().default("development"),
  })
  .superRefine((env, ctx) => {
    if (env.WEB_REVALIDATE_URLS.length > 0 && env.REVALIDATE_SECRET.length < 32) {
      ctx.addIssue({
        code: "custom",
        path: ["REVALIDATE_SECRET"],
        message: "must be at least 32 characters when WEB_REVALIDATE_URLS is set",
      });
    }
    if (env.NODE_ENV === "production" && !env.S3_BUCKET) {
      ctx.addIssue({
        code: "custom",
        path: ["S3_BUCKET"],
        message: "is required in production: media on local disk is not shared between nodes",
      });
    }
  });

export type Env = z.infer<typeof schema>;

/**
 * Values used only while `next build` evaluates the config, which never
 * connects to the database: the image is built once and configured at run
 * time, so the build needs no secrets.
 */
const BUILD_PLACEHOLDERS = {
  DATABASE_URL: "postgres://build@localhost/build",
  PAYLOAD_SECRET: "build-time-placeholder-not-used-at-run-time",
  CMS_PUBLIC_URL: "http://localhost:3001",
  NODE_ENV: "build",
};

export function isBuildPhase(env: Record<string, string | undefined>): boolean {
  return env.NEXT_PHASE === "phase-production-build";
}

/** Parses the CMS's environment; every problem is reported at once. */
export function parseEnv(env: Record<string, string | undefined>): Env {
  const present = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ""),
  );
  const input = isBuildPhase(env)
    ? { ...BUILD_PLACEHOLDERS, ...present, NODE_ENV: "build" }
    : present;
  const result = schema.safeParse(input);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join(".")} ${i.message}`);
    throw new Error(`Invalid CMS configuration:\n${problems.join("\n")}`);
  }
  return result.data;
}
