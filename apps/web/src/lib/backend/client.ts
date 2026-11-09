import type { z } from "zod";
import { CircuitBreaker } from "./breaker";
import { BackendError } from "./errors";
import { envelopeSchema } from "./schemas";

export type Query = Record<string, string | number | boolean | undefined | null>;

/** How Next.js may cache an answer: seconds to keep it, and its tags. */
export interface CacheOptions {
  revalidate?: number | false;
  tags?: string[];
}

export interface RequestOptions extends CacheOptions {
  query?: Query;
  /** The visitor's languages, passed on so that messages come translated. */
  locale?: string;
  requestId?: string;
  /** More headers, such as the visitor's forwarded headers. */
  headers?: Record<string, string>;
}

export interface ClientOptions {
  baseUrl: string;
  timeoutMs: number;
  retries?: number;
  breaker?: CircuitBreaker;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const MAX_RETRY_AFTER_MS = 2_000;

/**
 * A small client for the backend's GET routes. It unwraps the response
 * envelope, validates `info` with a schema, and maps every failure to a
 * BackendError. Only idempotent GETs are retried: on network errors,
 * timeouts, 429, 502, 503, and 504, at most `retries` times, with jittered
 * backoff that honors a short Retry-After.
 */
export class BackendClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly breaker: CircuitBreaker;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs;
    this.retries = options.retries ?? 2;
    this.breaker = options.breaker ?? new CircuitBreaker();
    this.fetchFn = options.fetch ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = options.random ?? Math.random;
  }

  url(path: string, query?: Query): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  async get<T extends z.ZodType>(
    path: string,
    schema: T,
    options: RequestOptions = {},
  ): Promise<z.infer<T>> {
    const url = this.url(path, options.query);
    let attempt = 0;
    for (;;) {
      try {
        return await this.once(url, schema, options);
      } catch (error) {
        const failure = error instanceof BackendError ? error : unexpected(error);
        if (!failure.transient || failure.code === "circuit_open" || attempt >= this.retries) {
          throw failure;
        }
        await this.sleep(this.backoff(attempt, failure.retryAfterSeconds));
        attempt += 1;
      }
    }
  }

  private backoff(attempt: number, retryAfterSeconds?: number): number {
    if (retryAfterSeconds !== undefined) {
      return Math.min(retryAfterSeconds * 1000, MAX_RETRY_AFTER_MS);
    }
    const base = 100 * 2 ** attempt;
    return Math.round(base / 2 + this.random() * base);
  }

  private async once<T extends z.ZodType>(
    url: string,
    schema: T,
    options: RequestOptions,
  ): Promise<z.infer<T>> {
    if (!this.breaker.allow()) {
      throw new BackendError("circuit_open", 0, "The backend is unavailable");
    }
    const headers: Record<string, string> = { ...options.headers, Accept: "application/json" };
    if (options.locale) {
      headers["Accept-Language"] = options.locale;
      headers["X-Locale"] = options.locale;
    }
    if (options.requestId) headers["X-Request-ID"] = options.requestId;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
        next: { revalidate: options.revalidate, tags: options.tags },
      } as RequestInit);
    } catch (error) {
      this.breaker.failure();
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      throw new BackendError(
        timedOut ? "timeout" : "network_error",
        0,
        timedOut ? "The backend did not answer in time" : "The backend could not be reached",
      );
    }

    const body: unknown = await response.json().catch(() => undefined);
    const envelope = envelopeSchema.safeParse(body);
    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));

    if (!response.ok) {
      // A 5xx counts against the backend; a 4xx is an answer, not a failure.
      if (response.status >= 500) this.breaker.failure();
      else this.breaker.success();
      const data = envelope.success ? envelope.data : undefined;
      throw new BackendError(
        data?.code ?? (response.status === 404 ? "not_found" : "error"),
        response.status,
        data?.message ?? response.statusText,
        data?.request_id ?? response.headers.get("x-request-id") ?? undefined,
        retryAfter,
      );
    }

    this.breaker.success();
    if (!envelope.success) {
      throw new BackendError("invalid_response", response.status, "The answer is not an envelope");
    }
    const info = schema.safeParse(envelope.data.info);
    if (!info.success) {
      throw new BackendError(
        "invalid_response",
        response.status,
        `The answer does not match the expected schema: ${info.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
        envelope.data.request_id,
      );
    }
    return info.data;
  }
}

function unexpected(error: unknown): BackendError {
  return new BackendError("error", 0, error instanceof Error ? error.message : String(error));
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/** Walks a cursor-paginated list, page by page. */
export async function* paginate<T>(
  fetchPage: (cursor?: string) => Promise<{ items: T[]; next_cursor?: string }>,
  maxPages = Number.POSITIVE_INFINITY,
): AsyncGenerator<T[]> {
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await fetchPage(cursor);
    yield result.items;
    if (!result.next_cursor || result.next_cursor === cursor) return;
    cursor = result.next_cursor;
  }
}
