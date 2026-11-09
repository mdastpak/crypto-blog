import "server-only";
import { sharedCache } from "./cache/shared";
import { ConfigError, getConfig } from "./config";
import { startCatalogSync } from "./seo/catalog-server";
import { installShutdownHandlers } from "./shutdown";

/**
 * Start-up of a Node.js server process. Invalid configuration stops the
 * process with a non-zero code: Next.js only logs a failing instrumentation
 * hook and goes on serving, which would hide the problem until the first
 * request.
 */
export function startServer(): void {
  try {
    getConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
  installShutdownHandlers();
  // Connects to the shared cache now, not on the first request (lib/cache).
  sharedCache();
  // The copy of the catalog behind sitemaps, coin JSON-LD, and 410s (docs/seo.md).
  startCatalogSync();
}
