import { createHash } from "node:crypto";
import type { RawEntry } from "./feed.ts";

/** An item ready to store. */
export interface NewsItem {
  url: string;
  canonicalUrl: string;
  title: string;
  summary?: string;
  content?: string;
  imageUrl?: string;
  author?: string;
  language: "fa" | "en";
  publishedAt: Date;
  contentHash: string;
  titleTokens: string[];
}

// Tracking parameters that never change what a URL points to.
const TRACKING =
  /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|yclid|_hsenc|_hsmi|ref|ref_src|cmpid|ocid)$/i;

/**
 * A canonical form of an article URL, for exact deduplication: https when
 * the source used it, a lowercase host without `www.`, no fragment, no
 * tracking parameters, the rest sorted, and no trailing slash.
 */
export function canonicalUrl(raw: string, base?: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw.trim(), base);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  url.hash = "";
  url.username = "";
  url.password = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  ) {
    url.port = "";
  }
  const params = [...url.searchParams]
    .filter(([k]) => !TRACKING.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = new URLSearchParams(params).toString();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Plain text from feed HTML: no tags, scripts, or styles; entities decoded; spaces collapsed. */
export function cleanText(html: string | undefined): string {
  if (!html) return "";
  return (
    html
      .replace(/<(script|style|noscript|iframe)[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
        if (code[0] === "#") {
          const n =
            code[1]?.toLowerCase() === "x"
              ? parseInt(code.slice(2), 16)
              : parseInt(code.slice(1), 10);
          return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
        }
        return ENTITIES[code.toLowerCase()] ?? whole;
      })
      // eslint-disable-next-line no-control-regex -- removing control characters is the point
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Cuts text at a word boundary, with an ellipsis. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Persian when most letters are in the Arabic script, else English. */
export function detectLanguage(text: string, fallback: "fa" | "en"): "fa" | "en" {
  const arabic = (text.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (arabic + latin < 8) return fallback;
  return arabic > latin ? "fa" : "en";
}

/**
 * The published time in UTC. Missing or unreadable: the time it was fetched.
 * More than an hour in the future (a wrong time zone): clamped to now.
 */
export function publishedTime(raw: string | undefined, now: Date): Date {
  const parsed = raw ? new Date(raw.trim()) : undefined;
  if (!parsed || Number.isNaN(parsed.getTime())) return now;
  return parsed.getTime() > now.getTime() + 3600_000 ? now : parsed;
}

const STOPWORDS = new Set(
  (
    "a an the and or of to in on for with by at from as is are was were be been this that it its " +
    "after over into new says say said amid why how what will can could may up down vs " +
    "و در به از که این آن با برای را تا یک بر هم شد شده است می خود اما یا"
  ).split(" "),
);

/** Normalizes Persian letters so that variants compare equal. */
export function normalizeLetters(text: string): string {
  return text
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/‌/g, " ")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** The words of a title that tell stories apart, for near-duplicate detection. */
export function titleTokens(title: string): string[] {
  const words = normalizeLetters(title)
    .toLowerCase()
    .split(/[^\p{L}\p{N}$]+/u)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return [...new Set(words)];
}

/** A hash of the normalized title and summary, for exact duplicates under other URLs. */
export function contentHash(title: string, summary: string): string {
  const text = normalizeLetters(`${title}\n${summary}`).toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(text).digest("hex");
}

export interface NormalizeOptions {
  language: "fa" | "en";
  license: "headline" | "full";
  feedUrl: string;
  now: Date;
}

const SUMMARY_MAX = 300;
const CONTENT_MAX = 50_000;

/**
 * A stored item from a feed entry, or undefined when it has no usable title
 * or link. With a `headline` license only the title, a short summary, the
 * link, and metadata are kept; `full` also keeps the text.
 */
export function normalizeEntry(entry: RawEntry, options: NormalizeOptions): NewsItem | undefined {
  const title = truncate(cleanText(entry.title), 300);
  const link = entry.link ?? (entry.guid && /^https?:/.test(entry.guid) ? entry.guid : undefined);
  const canonical = link ? canonicalUrl(link, options.feedUrl) : undefined;
  if (!title || !canonical) return undefined;
  const text = cleanText(entry.summary ?? entry.content);
  const summary = text ? truncate(text, SUMMARY_MAX) : undefined;
  const content =
    options.license === "full" && entry.content
      ? truncate(cleanText(entry.content), CONTENT_MAX)
      : undefined;
  const image = entry.image ? canonicalUrl(entry.image, options.feedUrl) : undefined;
  const language = detectLanguage(`${title} ${summary ?? ""}`, options.language);
  // Arabic ي and ك in Persian text become the Persian letters, so text searches and reads alike.
  const persian = (text: string | undefined) =>
    language === "fa" && text ? text.replace(/ي/g, "ی").replace(/ك/g, "ک") : text;
  return {
    url: new URL(link!.trim(), options.feedUrl).toString(),
    canonicalUrl: canonical,
    title: persian(title)!,
    summary: persian(summary),
    content: persian(content),
    imageUrl: image,
    author: entry.author ? truncate(cleanText(entry.author), 200) : undefined,
    language,
    publishedAt: publishedTime(entry.published, options.now),
    contentHash: contentHash(title, summary ?? ""),
    titleTokens: titleTokens(title),
  };
}
