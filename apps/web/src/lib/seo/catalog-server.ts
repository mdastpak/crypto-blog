import "server-only";
import { marketData } from "@/lib/backend";
import { CatalogCopy, catalogCopy } from "./catalog";
import { logger } from "@/lib/log";

/** How often a node follows the feed. */
export const CATALOG_SYNC_MS = 5 * 60_000;

/** This process's catalog copy, created on first use. */
export function catalog(): CatalogCopy {
  return catalogCopy(() => new CatalogCopy((q) => marketData.feed(q)))!;
}

/**
 * Follows the feed in the background: at start, then every five minutes.
 * A failed sync is retried at the next tick; pages never wait for it.
 */
export function startCatalogSync(): void {
  const copy = catalog();
  const tick = () =>
    copy.sync().catch((error: unknown) => logger.warn("catalog sync failed", { error }));
  void tick();
  setInterval(tick, CATALOG_SYNC_MS).unref();
}
