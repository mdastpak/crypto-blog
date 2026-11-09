import { hostname } from "node:os";
import { z } from "zod";

const url = z.url({ protocol: /^https?$/, error: "must be an absolute http or https URL" });
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const schema = z.object({
  DATABASE_URL: z.string().min(1, "is required"),
  DEPLOYMENT_REGION: z.enum(["ir", "international"]).default("ir"),
  NEWS_SOURCES_FILE: z.string().default("sources.json"),
  // The market data catalog, for the coins an item mentions; optional.
  BACKEND_API_URL: url.optional(),
  // This node's egress: unset is direct; an http(s) proxy otherwise (per node, like
  // the backend's market worker).
  NEWS_HTTP_PROXY: url.optional(),
  // A page about the bot, named in the User-Agent so source owners can reach us.
  NEWS_BOT_INFO_URL: url,
  FETCH_TIMEOUT_MS: int(1000, 120_000).default(15_000),
  MAX_FEED_BYTES: int(10_000, 50_000_000).default(5_000_000),
  CONCURRENCY: int(1, 64).default(4),
  LEASE_SECONDS: int(30, 3600).default(120),
  POLL_SECONDS: int(1, 600).default(10),
  HOST_MIN_INTERVAL_MS: int(0, 600_000).default(2_000),
  CLUSTER_WINDOW_HOURS: int(1, 24 * 14).default(48),
  PORT: int(1, 65535).default(3002),
  WORKER_ID: z.string().min(1).max(100).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export interface Config {
  databaseUrl: string;
  region: "ir" | "international";
  sourcesFile: string;
  backendApiUrl?: string;
  httpProxy?: string;
  userAgent: string;
  fetchTimeoutMs: number;
  maxFeedBytes: number;
  concurrency: number;
  leaseSeconds: number;
  pollSeconds: number;
  hostMinIntervalMs: number;
  clusterWindowHours: number;
  port: number;
  workerId: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid news worker configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

/** Parses the environment; every problem is reported at once, empty values count as unset. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const input = Object.fromEntries(
    Object.keys(schema.shape).map((key) => {
      const value = env[key];
      return [key, value === undefined || value.trim() === "" ? undefined : value.trim()];
    }),
  );
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => {
        const key = issue.path.join(".");
        return input[key] === undefined ? `${key} is required` : `${key} ${issue.message}`;
      }),
    );
  }
  const c = result.data;
  return {
    databaseUrl: c.DATABASE_URL,
    region: c.DEPLOYMENT_REGION,
    sourcesFile: c.NEWS_SOURCES_FILE,
    backendApiUrl: c.BACKEND_API_URL?.replace(/\/+$/, ""),
    httpProxy: c.NEWS_HTTP_PROXY,
    userAgent: `CryptoBlogNewsBot/0.1 (+${c.NEWS_BOT_INFO_URL})`,
    fetchTimeoutMs: c.FETCH_TIMEOUT_MS,
    maxFeedBytes: c.MAX_FEED_BYTES,
    concurrency: c.CONCURRENCY,
    leaseSeconds: c.LEASE_SECONDS,
    pollSeconds: c.POLL_SECONDS,
    hostMinIntervalMs: c.HOST_MIN_INTERVAL_MS,
    clusterWindowHours: c.CLUSTER_WINDOW_HOURS,
    port: c.PORT,
    workerId: c.WORKER_ID ?? `${hostname()}-${process.pid}`,
    logLevel: c.LOG_LEVEL,
  };
}

/** The source regions a release collects: Iranian sources only in an Iranian release. */
export function sourceRegions(region: Config["region"]): ("ir" | "global")[] {
  return region === "ir" ? ["ir", "global"] : ["global"];
}
