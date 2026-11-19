import { Agent, ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";
import {
  EgressError,
  guardedLookup,
  resolvePublic,
  systemLookup,
  type LookupFn,
} from "./egress.ts";
import { ALLOW_ALL, DISALLOW_ALL, parseRobots, type Robots } from "./robots.ts";

export type FetchFn = (
  url: string,
  init: {
    headers: Record<string, string>;
    signal: AbortSignal;
    redirect: "manual";
    dispatcher?: Dispatcher;
  },
) => Promise<Response>;

export interface HttpOptions {
  userAgent: string;
  timeoutMs: number;
  maxBytes: number;
  /** Minimum time between two requests to one host from this node. */
  hostMinIntervalMs: number;
  proxy?: string;
  fetch?: FetchFn;
  /** Resolves a host name; the system resolver by default. */
  lookup?: LookupFn;
  /** Lets requests reach private and loopback addresses. For tests only. */
  allowPrivate?: boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface Validators {
  etag?: string | null;
  lastModified?: string | null;
}

/** Where a feed says it has moved for good (301 or 308), when it does. */
export interface Moved {
  movedTo?: string;
}

export type FetchOutcome =
  | ({ kind: "ok"; body: string; etag?: string; lastModified?: string; finalUrl: string } & Moved)
  | ({ kind: "not_modified" } & Moved)
  | { kind: "blocked"; reason: string }
  | { kind: "error"; status?: number; reason: string; retryAfterSeconds?: number };

const ROBOTS_TTL_MS = 24 * 3600_000;
/** Redirects followed for a feed. */
export const MAX_REDIRECTS = 3;
/** Redirects followed for robots.txt (RFC 9309 asks for at least five). */
const MAX_ROBOTS_REDIRECTS = 5;
const REDIRECT = new Set([301, 302, 303, 307, 308]);
const PERMANENT = new Set([301, 308]);

/** A request refused before it was sent, or a redirect not followed. */
class Refused extends Error {
  constructor(
    message: string,
    /** Refused by robots.txt rather than by the egress rules. */
    readonly byRobots = false,
  ) {
    super(message);
  }
}

type Followed = { response: Response; url: URL; movedTo?: string };

/**
 * Fetches feeds politely: a descriptive User-Agent, conditional requests,
 * robots.txt, a minimum interval per host, a timeout, and a size limit.
 * Requests leave through this node's egress (direct, or NEWS_HTTP_PROXY),
 * to public addresses only, and redirects are followed by hand: at most
 * three, never from https to http, each checked like the first URL.
 */
export class PoliteHttp {
  private readonly dispatcher: Dispatcher;
  private readonly fetchFn: FetchFn;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly nextSlot = new Map<string, number>();
  private readonly robots = new Map<string, { robots: Robots; until: number }>();
  private readonly lookup: LookupFn;

  constructor(private readonly options: HttpOptions) {
    this.lookup = options.lookup ?? systemLookup;
    // Direct: the address is checked again at connect time, from the same
    // resolution the socket dials (no DNS rebinding). Through a proxy, the
    // proxy resolves; the check before each request is all we can do here.
    this.dispatcher = options.proxy
      ? new ProxyAgent(options.proxy)
      : new Agent({
          connections: 8,
          keepAliveTimeout: 30_000,
          connect: options.allowPrivate ? undefined : { lookup: guardedLookup(this.lookup) },
        });
    this.fetchFn = options.fetch ?? (undiciFetch as unknown as FetchFn);
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** This node's egress, for other outbound calls such as channel posts. */
  get egress(): Dispatcher {
    return this.dispatcher;
  }

  /** The product token robots.txt groups are matched against. */
  get productToken(): string {
    return this.options.userAgent.split("/")[0]!;
  }

  private async slot(host: string): Promise<void> {
    const now = this.now();
    const at = Math.max(now, this.nextSlot.get(host) ?? 0);
    this.nextSlot.set(host, at + this.options.hostMinIntervalMs);
    if (at > now) await this.sleep(at - now);
  }

  /** Refuses a URL whose host is not public, unless private addresses are allowed. */
  async checkTarget(url: URL): Promise<void> {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Refused(`refused: ${url.protocol} URL`);
    }
    if (this.options.allowPrivate) return;
    try {
      await resolvePublic(url.hostname, this.lookup);
    } catch (error) {
      if (error instanceof EgressError) throw new Refused(`refused: ${error.message}`);
      throw error;
    }
  }

  private async request(url: URL, headers: Record<string, string>) {
    await this.checkTarget(url);
    await this.slot(url.host);
    return this.fetchFn(url.href, {
      headers: { "User-Agent": this.options.userAgent, ...headers },
      signal: AbortSignal.timeout(this.options.timeoutMs),
      redirect: "manual",
      dispatcher: this.dispatcher,
    });
  }

  /**
   * Requests a URL and follows up to `max` redirects, each checked like
   * the first: a public host, no step down from https to http, and, for a
   * feed, its own robots.txt. `movedTo` is where the permanent redirects at
   * the start of the chain lead.
   */
  private async follow(
    start: URL,
    headers: Record<string, string>,
    max: number,
    robots: boolean,
  ): Promise<Followed> {
    let url = start;
    let movedTo: string | undefined;
    let permanent = true;
    for (let hops = 0; ; hops++) {
      if (robots) {
        // The host first, so a private one is an error, not a robots.txt we could not read.
        await this.checkTarget(url);
        if (!(await this.robotsFor(url)).allows(url.pathname + url.search)) {
          throw new Refused(
            hops ? `redirect to ${url.href} disallowed by robots.txt` : "disallowed by robots.txt",
            true,
          );
        }
      }
      const response = await this.request(url, headers);
      const location = response.headers.get("location");
      if (!REDIRECT.has(response.status) || location === null) return { response, url, movedTo };
      await response.body?.cancel().catch(() => {});
      if (hops >= max) throw new Refused(`more than ${max} redirects`);
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        throw new Refused(`redirect to an invalid URL: ${location.slice(0, 200)}`);
      }
      if (url.protocol === "https:" && next.protocol === "http:") {
        throw new Refused(`refused: redirect from https to http (${next.href})`);
      }
      permanent &&= PERMANENT.has(response.status);
      if (permanent) movedTo = next.href;
      url = next;
    }
  }

  /** The host's robots.txt, cached a day. Unreachable or 5xx: nothing is allowed for now. */
  async robotsFor(url: URL): Promise<Robots> {
    const key = url.origin;
    const cached = this.robots.get(key);
    if (cached && cached.until > this.now()) return cached.robots;
    let robots: Robots;
    let ttl = ROBOTS_TTL_MS;
    try {
      const { response } = await this.follow(
        new URL("/robots.txt", key),
        { Accept: "text/plain" },
        MAX_ROBOTS_REDIRECTS,
        false,
      );
      if (response.ok)
        robots = parseRobots(await readLimited(response, 500_000), this.productToken);
      else if (response.status >= 500) {
        robots = DISALLOW_ALL;
        ttl = 15 * 60_000;
      } else robots = ALLOW_ALL;
    } catch {
      robots = DISALLOW_ALL;
      ttl = 15 * 60_000;
    }
    this.robots.set(key, { robots, until: this.now() + ttl });
    return robots;
  }

  async fetchFeed(url: string, validators: Validators = {}): Promise<FetchOutcome> {
    const headers: Record<string, string> = {
      Accept:
        "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
    };
    if (validators.etag) headers["If-None-Match"] = validators.etag;
    if (validators.lastModified) headers["If-Modified-Since"] = validators.lastModified;
    let followed: Followed;
    try {
      followed = await this.follow(new URL(url), headers, MAX_REDIRECTS, true);
    } catch (error) {
      if (error instanceof Refused) {
        return error.byRobots
          ? { kind: "blocked", reason: error.message }
          : { kind: "error", reason: error.message };
      }
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      return { kind: "error", reason: timedOut ? "timeout" : `network: ${message(error)}` };
    }
    const { response, movedTo } = followed;
    if (response.status === 304) return { kind: "not_modified", movedTo };
    if (!response.ok) {
      const retryAfter = Number(response.headers.get("retry-after"));
      return {
        kind: "error",
        status: response.status,
        reason: `HTTP ${response.status}`,
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      };
    }
    try {
      const body = await readLimited(response, this.options.maxBytes);
      return {
        kind: "ok",
        body,
        etag: response.headers.get("etag") ?? undefined,
        lastModified: response.headers.get("last-modified") ?? undefined,
        finalUrl: followed.url.href,
        movedTo,
      };
    } catch (error) {
      return { kind: "error", reason: message(error) };
    }
  }

  async close(): Promise<void> {
    await this.dispatcher.close();
  }
}

/** The error's message, with its causes: undici reports "fetch failed" with the reason as the cause. */
function message(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause ? `${error.message}: ${message(error.cause)}` : error.message;
}

/** Reads a body as UTF-8 text, refusing one larger than `max` bytes. */
export async function readLimited(response: Response, max: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new Error(`body larger than ${max} bytes`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error(`body larger than ${max} bytes`);
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}
