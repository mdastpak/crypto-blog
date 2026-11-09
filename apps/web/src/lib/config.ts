import "server-only";
import { z } from "zod";
import { BRANDS, DEFAULT_BRAND, isBrand } from "@/design/brands";
import { AVAILABLE_LOCALES, isAvailableLocale, type Locale } from "@/i18n/locales";

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
  EXCHANGE_APP_URL: baseUrl.optional(),
  BACKEND_TIMEOUT_MS: positiveInt(60_000).default(5_000),
  SHUTDOWN_DRAIN_SECONDS: z.coerce.number().int().min(0).max(300).default(10),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  LOCALES: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined;
      const tags = [...new Set(value.split(",").map((t) => t.trim().toLowerCase()))].filter(
        Boolean,
      );
      const unknown = tags.filter((t) => !isAvailableLocale(t));
      if (unknown.length || tags.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: `must list locales of this build (${AVAILABLE_LOCALES.join(", ")}); unknown: ${unknown.join(", ") || "none given"}`,
        });
        return z.NEVER;
      }
      return tags as Locale[];
    }),
  SITE_DETECTION: z
    .enum(["true", "false"], { error: "must be true or false" })
    .default("true")
    .transform((value) => value === "true"),
  SITE_TIMEOUT_MS: positiveInt(10_000).default(800),
  TRUST_PROXY_HEADERS: z
    .enum(["true", "false"], { error: "must be true or false" })
    .default("false")
    .transform((value) => value === "true"),
  BRAND: z
    .string()
    .default(DEFAULT_BRAND)
    .transform((value) => value.trim().toLowerCase())
    .refine(isBrand, { error: `must be one of: ${Object.keys(BRANDS).join(", ")}` }),
  DESIGN_GALLERY: z
    .enum(["true", "false"], { error: "must be true or false" })
    .default("false")
    .transform((value) => value === "true"),
  DEFAULT_LOCALE: z
    .string()
    .optional()
    .transform((value) => value?.trim().toLowerCase()),
  // The quotes the exchange lists every currency against; a release drops
  // those it may not show (IRT abroad).
  MARKET_QUOTES: z
    .string()
    .default("USDT,IRT")
    .transform((value) => [
      ...new Set(
        value
          .split(",")
          .map((q) => q.trim().toUpperCase())
          .filter(Boolean),
      ),
    ])
    .pipe(
      z
        .array(z.string().regex(/^[A-Z0-9]{2,10}$/, "must list symbols such as USDT,IRT"))
        .min(1, "must list at least one quote"),
    ),
  CMS_API_URL: baseUrl.optional(),
  CMS_MEDIA_URL: baseUrl.optional(),
  REVALIDATE_SECRET: z.string().min(32, "must be at least 32 characters").optional(),
  CMS_PREVIEW_API_KEY: z.string().min(16, "must be at least 16 characters").optional(),
  SITE_ID: z
    .string()
    .optional()
    .transform((value) => value?.trim().toLowerCase())
    .pipe(
      z
        .string()
        .regex(/^[a-z0-9-]{1,32}$/, "must be a site id such as ir or global")
        .optional(),
    ),
});

export interface Config {
  backendApiUrl: string;
  publicSiteUrl: string;
  /** The exchange's web app, for "Trade" links on listed coins; none when unset. */
  exchangeAppUrl?: string;
  region: Region;
  backendTimeoutMs: number;
  shutdownDrainSeconds: number;
  logLevel: (typeof LOG_LEVELS)[number];
  /** The locales this release serves, in the order of the switcher. */
  locales: Locale[];
  /** The locale of a visitor whose languages match none of `locales`. */
  defaultLocale: Locale;
  /** Asks the backend for the visitor's country site on the first page view of a visit. */
  siteDetection: boolean;
  siteTimeoutMs: number;
  /** Trust X-Forwarded-For/-Host/-Proto: only behind a load balancer that sets them. */
  trustProxyHeaders: boolean;
  /** The brand of this release (design/brands.ts). */
  brand: string;
  /** Serves the component gallery at /{locale}/design; off in production. */
  designGallery: boolean;
  /** The CMS's REST API (`…/api`); without it the blog has no editorial pages. */
  cmsApiUrl?: string;
  /** A public base URL of CMS media (a CDN); unset, media is proxied by this app. */
  cmsMediaUrl?: string;
  /** Shared with the CMS: signs revalidation calls and preview links. */
  revalidateSecret?: string;
  /** The API key of a CMS viewer account, to read drafts in preview. */
  cmsPreviewApiKey?: string;
  /** The country site this deployment serves; content limited to other sites is hidden. */
  siteId?: string;
  /** The quotes of the exchange's markets (MARKET_QUOTES), before the region's filter. */
  marketQuotes: string[];
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
  // Persian first in an Iranian release, English first elsewhere.
  const regionDefault: Locale = c.DEPLOYMENT_REGION === "ir" ? "fa" : "en";
  const locales = c.LOCALES ?? [
    regionDefault,
    ...AVAILABLE_LOCALES.filter((l) => l !== regionDefault),
  ];
  const defaultLocale =
    c.DEFAULT_LOCALE ?? (locales.includes(regionDefault) ? regionDefault : locales[0]!);
  if (!isAvailableLocale(defaultLocale) || !locales.includes(defaultLocale)) {
    throw new ConfigError([`DEFAULT_LOCALE must be one of LOCALES (${locales.join(", ")})`]);
  }
  return {
    backendApiUrl: c.BACKEND_API_URL,
    publicSiteUrl: c.PUBLIC_SITE_URL,
    exchangeAppUrl: c.EXCHANGE_APP_URL,
    region: c.DEPLOYMENT_REGION,
    backendTimeoutMs: c.BACKEND_TIMEOUT_MS,
    shutdownDrainSeconds: c.SHUTDOWN_DRAIN_SECONDS,
    logLevel: c.LOG_LEVEL,
    locales,
    defaultLocale,
    siteDetection: c.SITE_DETECTION,
    siteTimeoutMs: c.SITE_TIMEOUT_MS,
    trustProxyHeaders: c.TRUST_PROXY_HEADERS,
    brand: c.BRAND,
    designGallery: c.DESIGN_GALLERY,
    cmsApiUrl: c.CMS_API_URL,
    cmsMediaUrl: c.CMS_MEDIA_URL,
    revalidateSecret: c.REVALIDATE_SECRET,
    cmsPreviewApiKey: c.CMS_PREVIEW_API_KEY,
    siteId: c.SITE_ID,
    marketQuotes: c.MARKET_QUOTES,
  };
}

let cached: Config | undefined;

/** The configuration of this process, parsed once from `process.env`. */
export function getConfig(): Config {
  cached ??= parseConfig(process.env);
  return cached;
}
