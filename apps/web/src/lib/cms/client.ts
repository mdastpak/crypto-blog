import type { z } from "zod";
import { CircuitBreaker } from "../backend/breaker";

/** A failed call to the CMS; `status` is 0 when no answer came. */
export class CmsError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly circuitOpen = false,
  ) {
    super(message);
    this.name = "CmsError";
  }

  get transient(): boolean {
    if (this.circuitOpen) return false;
    return this.status === 0 || this.status === 429 || this.status >= 502;
  }
}

/** A Payload `where` clause: fields to operators, with `and` and `or`. */
export type Where = { [key: string]: unknown };

export interface FindOptions {
  where?: Where;
  sort?: string;
  limit?: number;
  page?: number;
  depth?: number;
  /** Fields to return; the rest are left out. */
  select?: string[];
  /** Reads the latest draft; needs the preview API key, and is never cached. */
  draft?: boolean;
  /** Next.js cache lifetime in seconds, and tags. */
  revalidate?: number;
  tags?: string[];
}

export interface CmsClientOptions {
  baseUrl: string;
  timeoutMs: number;
  /** The API key of a viewer account, sent only for drafts. */
  previewApiKey?: string;
  retries?: number;
  breaker?: CircuitBreaker;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** Flattens a nested clause into Payload's bracket syntax: `where[a][0][b]=v`. */
export function whereParams(where: Where, prefix = "where", out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(where)) {
    const name = `${prefix}[${key}]`;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === "object")
          whereParams(item as Where, `${name}[${i}]`, out);
        else out.append(`${name}[${i}]`, String(item));
      });
    } else if (value !== null && typeof value === "object") {
      whereParams(value as Where, name, out);
    } else if (value !== undefined) {
      out.append(name, String(value));
    }
  }
  return out;
}

/**
 * A small client for the CMS's read API (Payload REST). It always asks for
 * every locale (`locale=all`), so one cached answer serves every language of
 * the blog, and the blog applies its own fallback rules. Reads of published
 * content need no credentials; drafts use the preview key.
 */
export class CmsClient {
  private readonly baseUrl: string;
  private readonly retries: number;
  private readonly breaker: CircuitBreaker;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: CmsClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.retries = options.retries ?? 1;
    this.breaker = options.breaker ?? new CircuitBreaker();
    this.fetchFn = options.fetch ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  findUrl(collection: string, options: FindOptions): string {
    const params = whereParams(options.where ?? {});
    params.set("locale", "all");
    params.set("depth", String(options.depth ?? 1));
    if (options.sort) params.set("sort", options.sort);
    if (options.limit) params.set("limit", String(options.limit));
    if (options.page) params.set("page", String(options.page));
    for (const field of options.select ?? []) params.set(`select[${field}]`, "true");
    if (options.draft) params.set("draft", "true");
    return `${this.baseUrl}/${collection}?${params.toString()}`;
  }

  async find<T extends z.ZodType>(collection: string, schema: T, options: FindOptions = {}) {
    const url = this.findUrl(collection, options);
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.once(url, schema, options);
      } catch (error) {
        const failure =
          error instanceof CmsError
            ? error
            : new CmsError(0, error instanceof Error ? error.message : String(error));
        if (!failure.transient || attempt >= this.retries) throw failure;
        await this.sleep(150 * 2 ** attempt);
      }
    }
  }

  private async once<T extends z.ZodType>(
    url: string,
    schema: T,
    options: FindOptions,
  ): Promise<z.infer<T>> {
    if (!this.breaker.allow()) throw new CmsError(0, "The CMS is unavailable", true);
    const headers: Record<string, string> = { Accept: "application/json" };
    let init: RequestInit & { next?: unknown };
    if (options.draft) {
      if (!this.options.previewApiKey) throw new CmsError(401, "Previews are not set up");
      headers.Authorization = `users API-Key ${this.options.previewApiKey}`;
      init = { headers, cache: "no-store" };
    } else {
      init = { headers, next: { revalidate: options.revalidate, tags: options.tags } };
    }
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        ...init,
        signal: AbortSignal.timeout(this.options.timeoutMs),
      } as RequestInit);
    } catch (error) {
      this.breaker.failure();
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      throw new CmsError(
        0,
        timedOut ? "The CMS did not answer in time" : "The CMS could not be reached",
      );
    }
    if (!response.ok) {
      if (response.status >= 500) this.breaker.failure();
      else this.breaker.success();
      throw new CmsError(response.status, `The CMS answered ${response.status}`);
    }
    this.breaker.success();
    const body: unknown = await response.json().catch(() => undefined);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new CmsError(
        response.status,
        `The CMS's answer does not match the expected schema: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      );
    }
    return parsed.data;
  }
}
