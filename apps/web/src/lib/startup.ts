import "server-only";
import { sharedCache } from "./cache/shared";
import { ConfigError, getConfig } from "./config";
import { startCatalogSync } from "./seo/catalog-server";
import { imageOriginAllowed } from "./security/headers";
import { installShutdownHandlers } from "./shutdown";

/**
 * Start-up of a Node.js server process. Invalid configuration stops the
 * process with a non-zero code: Next.js only logs a failing instrumentation
 * hook and goes on serving, which would hide the problem until the first
 * request.
 */
export function startServer(): void {
  try {
    const { cmsMediaUrl } = getConfig();
    const built = (process.env.CSP_IMAGE_ORIGINS ?? "").split(",").filter(Boolean);
    if (!imageOriginAllowed(cmsMediaUrl, built)) {
      throw new ConfigError([
        `CMS_MEDIA_URL ${cmsMediaUrl} was not set when this image was built, so the Content-Security-Policy blocks its images; build with the same CMS_MEDIA_URL`,
      ]);
    }
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
