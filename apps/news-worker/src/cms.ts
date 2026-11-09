import { z } from "zod";
import type { Locale } from "./config.ts";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class CmsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CmsError";
  }

  /** A server error, a timeout, or a rate limit: worth trying again. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

const localized = z.record(z.string(), z.string().nullish()).nullish();

const existingSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  _status: z.enum(["draft", "published"]).nullish(),
  title: localized,
});
export type ExistingArticle = z.infer<typeof existingSchema>;

// A write answers in its one locale; only the id and status matter.
const writtenSchema = z.object({
  doc: z.object({
    id: z.union([z.number(), z.string()]).transform(String),
    _status: z.enum(["draft", "published"]).nullish(),
  }),
});
export type WrittenArticle = z.infer<typeof writtenSchema>["doc"];

const publishedSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  slug: z.string(),
  title: localized,
  excerpt: localized,
  publishedAt: z.string(),
  regions: z.array(z.string()).nullish(),
});
export type PublishedNews = z.infer<typeof publishedSchema>;

const list = <T extends z.ZodType>(doc: T) => z.object({ docs: z.array(doc) });

/** The fields the news worker writes on an article. */
export interface NewsData {
  type: "news";
  slug?: string;
  title: string;
  excerpt: string;
  body: unknown;
  coins: string[];
  sources: { name: string; url: string; title: string }[];
  externalId?: string;
  generatedBy: string;
  autoPublished?: boolean;
  regions: string[];
}

/**
 * The CMS's REST API, as the newsbot user (its API key). Every call has a
 * timeout; errors carry the status so the caller knows whether to retry.
 */
export class CmsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchFn: FetchLike = fetch,
    private readonly timeoutMs = 15_000,
  ) {}

  private async call<T>(
    path: string,
    params: Record<string, string>,
    schema: z.ZodType<T>,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const url = `${this.baseUrl}/api/${path}?${new URLSearchParams(params)}`;
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: init.method ?? "GET",
        headers: {
          Authorization: `users API-Key ${this.apiKey}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new CmsError(0, `CMS unreachable: ${error instanceof Error ? error.message : error}`);
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const errors = (body as { errors?: { message?: string }[] } | undefined)?.errors;
      const detail = errors?.map((e) => e.message).join("; ") || `HTTP ${response.status}`;
      throw new CmsError(response.status, `CMS ${init.method ?? "GET"} ${path}: ${detail}`);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new CmsError(502, `CMS ${path}: unexpected response`);
    return parsed.data;
  }

  /** The article drafted from a story, drafts included, in every locale. */
  async findByExternalId(externalId: string): Promise<ExistingArticle | undefined> {
    const { docs } = await this.call(
      "articles",
      {
        "where[externalId][equals]": externalId,
        draft: "true",
        locale: "all",
        depth: "0",
        limit: "1",
      },
      list(existingSchema),
    );
    return docs[0];
  }

  /** Creates the article in one locale: a draft, or published when the policy allows. */
  async create(data: NewsData, locale: Locale, publish: boolean): Promise<WrittenArticle> {
    const { doc } = await this.call(
      "articles",
      { locale, depth: "0", ...(publish ? {} : { draft: "true" }) },
      writtenSchema,
      { method: "POST", body: { ...data, _status: publish ? "published" : "draft" } },
    );
    return doc;
  }

  /** Adds a locale to an article as a draft; an editor publishes it. */
  async addLocale(id: string, data: NewsData, locale: Locale): Promise<WrittenArticle> {
    const { doc } = await this.call(
      `articles/${encodeURIComponent(id)}`,
      { locale, depth: "0", draft: "true" },
      writtenSchema,
      { method: "PATCH", body: { ...data, _status: "draft" } },
    );
    return doc;
  }

  /** News published since a time, oldest first, in every locale. */
  async publishedNewsSince(since: Date, limit = 100): Promise<PublishedNews[]> {
    const { docs } = await this.call(
      "articles",
      {
        "where[type][equals]": "news",
        "where[_status][equals]": "published",
        "where[publishedAt][greater_than]": since.toISOString(),
        sort: "publishedAt",
        locale: "all",
        depth: "0",
        limit: String(limit),
      },
      list(publishedSchema),
    );
    return docs;
  }
}
