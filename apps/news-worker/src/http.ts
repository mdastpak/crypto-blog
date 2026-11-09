import { Agent, ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";
import { ALLOW_ALL, DISALLOW_ALL, parseRobots, type Robots } from "./robots.ts";

export type FetchFn = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal; dispatcher?: Dispatcher },
) => Promise<Response>;

export interface HttpOptions {
  userAgent: string;
  timeoutMs: number;
  maxBytes: number;
  /** Minimum time between two requests to one host from this node. */
  hostMinIntervalMs: number;
  proxy?: string;
  fetch?: FetchFn;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface Validators {
  etag?: string | null;
  lastModified?: string | null;
}

export type FetchOutcome =
  | { kind: "ok"; body: string; etag?: string; lastModified?: string; finalUrl: string }
  | { kind: "not_modified" }
  | { kind: "blocked"; reason: string }
  | { kind: "error"; status?: number; reason: string; retryAfterSeconds?: number };

const ROBOTS_TTL_MS = 24 * 3600_000;

/**
 * Fetches feeds politely: a descriptive User-Agent, conditional requests,
 * robots.txt, a minimum interval per host, a timeout, and a size limit.
 * Requests leave through this node's egress (direct, or NEWS_HTTP_PROXY).
 */
export class PoliteHttp {
  private readonly dispatcher: Dispatcher;
  private readonly fetchFn: FetchFn;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly nextSlot = new Map<string, number>();
  private readonly robots = new Map<string, { robots: Robots; until: number }>();

  constructor(private readonly options: HttpOptions) {
    this.dispatcher = options.proxy
      ? new ProxyAgent(options.proxy)
      : new Agent({ connections: 8, keepAliveTimeout: 30_000 });
    this.fetchFn = options.fetch ?? (undiciFetch as unknown as FetchFn);
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
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

  private async request(url: string, headers: Record<string, string>) {
    await this.slot(new URL(url).host);
    return this.fetchFn(url, {
      headers: { "User-Agent": this.options.userAgent, ...headers },
      signal: AbortSignal.timeout(this.options.timeoutMs),
      dispatcher: this.dispatcher,
    });
  }

  /** The host's robots.txt, cached a day. Unreachable or 5xx: nothing is allowed for now. */
  async robotsFor(url: URL): Promise<Robots> {
    const key = url.origin;
    const cached = this.robots.get(key);
    if (cached && cached.until > this.now()) return cached.robots;
    let robots: Robots;
    let ttl = ROBOTS_TTL_MS;
    try {
      const response = await this.request(`${key}/robots.txt`, { Accept: "text/plain" });
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
    const target = new URL(url);
    const robots = await this.robotsFor(target);
    if (!robots.allows(target.pathname + target.search)) {
      return { kind: "blocked", reason: "disallowed by robots.txt" };
    }
    const headers: Record<string, string> = {
      Accept:
        "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
    };
    if (validators.etag) headers["If-None-Match"] = validators.etag;
    if (validators.lastModified) headers["If-Modified-Since"] = validators.lastModified;
    let response: Response;
    try {
      response = await this.request(url, headers);
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      return { kind: "error", reason: timedOut ? "timeout" : `network: ${message(error)}` };
    }
    if (response.status === 304) return { kind: "not_modified" };
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
        finalUrl: response.url || url,
      };
    } catch (error) {
      return { kind: "error", reason: message(error) };
    }
  }

  async close(): Promise<void> {
    await this.dispatcher.close();
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
