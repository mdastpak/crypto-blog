import "server-only";
import { z } from "zod";

/** Release regions, the same values as the backend's DEPLOYMENT_REGION. */
export const REGIONS = ["ir", "international"] as const;
export type Region = (typeof REGIONS)[number];

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

/** An absolute http(s) URL, stored without a trailing slash. */
const baseUrl = z
  .url({ protocol: /^https?$/, error: "must be an absolute http or https URL" })
  .transform((value) => value.replace(/\/+$/, ""));

const positiveInt = (max: number) => z.coerce.number().int().positive().max(max);

const schema = z.object({
  BACKEND_API_URL: baseUrl,
  PUBLIC_SITE_URL: baseUrl,
  DEPLOYMENT_REGION: z
    .string()
    .default("ir")
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.enum(REGIONS, { error: `must be one of: ${REGIONS.join(", ")}` })),
  BACKEND_TIMEOUT_MS: positiveInt(60_000).default(5_000),
  SHUTDOWN_DRAIN_SECONDS: z.coerce.number().int().min(0).max(300).default(10),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
});

export interface Config {
  backendApiUrl: string;
  publicSiteUrl: string;
  region: Region;
  backendTimeoutMs: number;
  shutdownDrainSeconds: number;
  logLevel: (typeof LOG_LEVELS)[number];
}

/** Thrown when the environment does not describe a valid configuration. */
export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

/**
 * Parses the configuration from environment variables. Every problem is
 * reported at once, so an operator can fix them in one go. Empty strings
 * count as unset, so that defaults apply to `VAR=` lines in env files.
 */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const input = Object.fromEntries(
    Object.keys(schema.shape).map((key) => {
      const value = env[key];
      return [key, value === undefined || value.trim() === "" ? undefined : value];
    }),
  );
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => {
        const key = issue.path.join(".");
        return issue.code === "invalid_type" && input[key] === undefined
          ? `${key} is required`
          : `${key} ${issue.message}`;
      }),
    );
  }
  const c = result.data;
  return {
    backendApiUrl: c.BACKEND_API_URL,
    publicSiteUrl: c.PUBLIC_SITE_URL,
    region: c.DEPLOYMENT_REGION,
    backendTimeoutMs: c.BACKEND_TIMEOUT_MS,
    shutdownDrainSeconds: c.SHUTDOWN_DRAIN_SECONDS,
    logLevel: c.LOG_LEVEL,
  };
}

let cached: Config | undefined;

/** The configuration of this process, parsed once from `process.env`. */
export function getConfig(): Config {
  cached ??= parseConfig(process.env);
  return cached;
}
