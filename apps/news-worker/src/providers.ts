import { parseFeed, type RawEntry } from "./feed.ts";
import type { FetchOutcome, PoliteHttp } from "./http.ts";
import type { LeasedSource } from "./store.ts";

export type ProviderResult =
  | { kind: "entries"; entries: RawEntry[]; etag?: string; lastModified?: string; baseUrl: string }
  | Exclude<FetchOutcome, { kind: "ok" }>;

/**
 * Reads one source. RSS and Atom feeds now; a JSON news API is another
 * provider with the same shape.
 */
export interface Provider {
  fetch(source: LeasedSource, http: PoliteHttp): Promise<ProviderResult>;
}

export const rssProvider: Provider = {
  async fetch(source, http) {
    const outcome = await http.fetchFeed(source.url, {
      etag: source.etag,
      lastModified: source.lastModified,
    });
    if (outcome.kind !== "ok") return outcome;
    try {
      const feed = parseFeed(outcome.body);
      return {
        kind: "entries",
        entries: feed.entries,
        etag: outcome.etag,
        lastModified: outcome.lastModified,
        baseUrl: outcome.finalUrl,
      };
    } catch (error) {
      return {
        kind: "error",
        reason: `unreadable feed: ${error instanceof Error ? error.message : error}`,
      };
    }
  },
};

export const PROVIDERS: Record<string, Provider> = { rss: rssProvider };
