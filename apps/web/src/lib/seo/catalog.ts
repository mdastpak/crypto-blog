import type { FeedPage } from "@/lib/backend/schemas";

/** What the blog keeps of a catalog asset, for sitemaps, JSON-LD, and 410s. */
export interface CatalogEntry {
  slug: string;
  updatedAt: string;
  removed: boolean;
  structuredData?: Record<string, unknown>;
}

export type FetchFeedPage = (query: { cursor?: string; limit: number }) => Promise<FeedPage>;

/**
 * This node's copy of the market data catalog, followed through the
 * backend's feed (`GET /market-data/feed/assets`): the first sync reads it
 * all, page after page; later ones ask with the kept cursor for what
 * changed. Each node keeps its own copy; the feed makes them converge.
 */
export class CatalogCopy {
  private readonly entries = new Map<string, CatalogEntry>();
  private cursor: string | undefined;
  private syncing: Promise<void> | undefined;
  /** When the last sync finished, or undefined before the first. */
  syncedAt: number | undefined;

  constructor(
    private readonly fetchPage: FetchFeedPage,
    private readonly now: () => number = Date.now,
  ) {}

  /** Follows the feed to its end; concurrent calls share one run. */
  sync(maxPages = 2000): Promise<void> {
    this.syncing ??= this.run(maxPages).finally(() => {
      this.syncing = undefined;
    });
    return this.syncing;
  }

  private async run(maxPages: number): Promise<void> {
    for (let page = 0; page < maxPages; page += 1) {
      const result = await this.fetchPage({ cursor: this.cursor, limit: 200 });
      for (const item of result.items) {
        this.entries.set(
          item.slug,
          item.removed
            ? { slug: item.slug, updatedAt: item.updated_at, removed: true }
            : {
                slug: item.slug,
                updatedAt: item.updated_at,
                removed: false,
                structuredData: item.structured_data,
              },
        );
      }
      if (result.next_cursor) this.cursor = result.next_cursor;
      if (!result.has_more || !result.next_cursor) break;
    }
    this.syncedAt = this.now();
  }

  /** Syncs when the copy is older than `maxAgeMs`; waits only for a first sync. */
  async fresh(maxAgeMs: number): Promise<void> {
    if (this.syncedAt === undefined) return this.sync();
    if (this.now() - this.syncedAt > maxAgeMs) void this.sync().catch(() => {});
  }

  get(slug: string): CatalogEntry | undefined {
    return this.entries.get(slug);
  }

  /** An asset an administrator hid: its page is gone (410). */
  isRemoved(slug: string): boolean {
    return this.entries.get(slug)?.removed === true;
  }

  /** The assets shown, by slug. */
  live(): CatalogEntry[] {
    return [...this.entries.values()]
      .filter((e) => !e.removed)
      .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  }
}

const KEY = Symbol.for("crypto-blog.catalog-copy");
const store = globalThis as typeof globalThis & { [KEY]?: CatalogCopy };

/**
 * The process's copy, shared through globalThis so that every bundle of the
 * server (pages, route handlers, the proxy) sees the same one.
 */
export function catalogCopy(create?: () => CatalogCopy): CatalogCopy | undefined {
  if (!store[KEY] && create) store[KEY] = create();
  return store[KEY];
}
