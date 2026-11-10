import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { imageOrigins, securityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  // A self-contained server bundle for the container image.
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // ISR pages, route handlers, and fetch results in one store that every
  // node shares (Redis), or in this process without CACHE_REDIS_* settings.
  cacheHandler: fileURLToPath(new URL("./cache-handler.ts", import.meta.url)),
  // No second, per-node copy in memory: nodes would serve different pages.
  cacheMaxMemorySize: 0,
  // The image origins the Content-Security-Policy allows, fixed at build
  // time; startup refuses a CMS_MEDIA_URL outside them (lib/startup.ts).
  env: { CSP_IMAGE_ORIGINS: imageOrigins(process.env.CMS_MEDIA_URL).join(",") },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

export default nextConfig;
