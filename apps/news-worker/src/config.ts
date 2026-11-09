import { hostname } from "node:os";
import { z } from "zod";

const url = z.url({ protocol: /^https?$/, error: "must be an absolute http or https URL" });
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const bool = z.enum(["true", "false"]).transform((v) => v === "true");
const locale = z.enum(["fa", "en"]);

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

  // Drafting and publishing (docs/news.md#editorial-workflow): on when both are set.
  CMS_API_URL: url.optional(),
  // The API key of the CMS user with the newsbot role.
  CMS_API_KEY: z.string().min(16, "must be at least 16 characters").optional(),
  NEWS_WRITER: z.enum(["template"]).default("template"),
  // The languages a translating writer drafts in; the template writer keeps the story's own.
  NEWS_DRAFT_LANGUAGES: z
    .string()
    .default("fa,en")
    .transform((v) => [...new Set(v.split(",").map((l) => l.trim()))])
    .pipe(z.array(locale).min(1)),
  NEWS_DRAFT_MIN_SOURCES: int(1, 50).default(2),
  NEWS_DRAFT_SETTLE_MINUTES: int(0, 24 * 60).default(20),
  NEWS_DRAFT_MAX_AGE_HOURS: int(1, 24 * 7).default(24),
  NEWS_DRAFT_REQUIRE_COINS: bool.default(true),
  // 0: every draft waits for an editor. N: a story from at least N sources is published at once, labeled.
  NEWS_AUTO_PUBLISH_MIN_SOURCES: int(0, 50).default(0),
  // Channels, for news published in the CMS; links point to the blog.
  BLOG_PUBLIC_URL: url.optional(),
  TELEGRAM_BOT_TOKEN: z
    .string()
    .regex(/^\d+:[\w-]{20,}$/, "is not a bot token")
    .optional(),
  TELEGRAM_CHAT_ID: z
    .string()
    .regex(/^(@\w{5,}|-?\d+)$/, "must be @channel or a numeric chat id")
    .optional(),
  TELEGRAM_LOCALE: locale.default("fa"),
  X_ACCESS_TOKEN: z.string().min(20, "is too short").optional(),
  X_LOCALE: locale.default("en"),
  CHANNEL_LOOKBACK_HOURS: int(1, 24 * 7).default(24),
});

export type Locale = z.infer<typeof locale>;

export type ChannelConfig =
  | { kind: "telegram"; id: string; token: string; chatId: string; locale: Locale }
  | { kind: "x"; id: string; token: string; locale: Locale };

export interface DraftingConfig {
  cmsApiUrl: string;
  cmsApiKey: string;
  writer: "template";
  languages: Locale[];
  minSources: number;
  settleMinutes: number;
  maxAgeHours: number;
  requireCoins: boolean;
  autoPublishMinSources: number;
  blogPublicUrl?: string;
  channels: ChannelConfig[];
  channelLookbackHours: number;
}

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
  /** Unset: the worker only collects. */
  drafting?: DraftingConfig;
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
  const problems: string[] = [];
  const pair = (a: keyof typeof c, b: keyof typeof c) => {
    if ((c[a] === undefined) !== (c[b] === undefined)) problems.push(`${a} and ${b} go together`);
  };
  pair("CMS_API_URL", "CMS_API_KEY");
  pair("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID");
  const channels: ChannelConfig[] = [];
  if (c.TELEGRAM_BOT_TOKEN && c.TELEGRAM_CHAT_ID) {
    channels.push({
      kind: "telegram",
      id: `telegram:${c.TELEGRAM_CHAT_ID}`,
      token: c.TELEGRAM_BOT_TOKEN,
      chatId: c.TELEGRAM_CHAT_ID,
      locale: c.TELEGRAM_LOCALE,
    });
  }
  if (c.X_ACCESS_TOKEN) {
    channels.push({ kind: "x", id: "x", token: c.X_ACCESS_TOKEN, locale: c.X_LOCALE });
  }
  if (channels.length && !c.CMS_API_URL) problems.push("channels need CMS_API_URL and CMS_API_KEY");
  if (channels.length && !c.BLOG_PUBLIC_URL) problems.push("channels need BLOG_PUBLIC_URL");
  if (problems.length) throw new ConfigError(problems);
  const drafting: DraftingConfig | undefined =
    c.CMS_API_URL && c.CMS_API_KEY
      ? {
          cmsApiUrl: c.CMS_API_URL.replace(/\/+$/, ""),
          cmsApiKey: c.CMS_API_KEY,
          writer: c.NEWS_WRITER,
          languages: c.NEWS_DRAFT_LANGUAGES,
          minSources: c.NEWS_DRAFT_MIN_SOURCES,
          settleMinutes: c.NEWS_DRAFT_SETTLE_MINUTES,
          maxAgeHours: c.NEWS_DRAFT_MAX_AGE_HOURS,
          requireCoins: c.NEWS_DRAFT_REQUIRE_COINS,
          autoPublishMinSources: c.NEWS_AUTO_PUBLISH_MIN_SOURCES,
          blogPublicUrl: c.BLOG_PUBLIC_URL?.replace(/\/+$/, ""),
          channels,
          channelLookbackHours: c.CHANNEL_LOOKBACK_HOURS,
        }
      : undefined;
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
    drafting,
  };
}

/** The source regions a release collects: Iranian sources only in an Iranian release. */
export function sourceRegions(region: Config["region"]): ("ir" | "global")[] {
  return region === "ir" ? ["ir", "global"] : ["global"];
}
