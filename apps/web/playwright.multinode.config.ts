import { defineConfig } from "@playwright/test";

/**
 * Two nodes of the production build behind no balancer, sharing one Redis
 * (CACHE_REDIS_URL, default a local server), with their own mock backend.
 * Run with `pnpm test:multinode` after `pnpm build`.
 */
const mockPort = 3198;
export const NODES = [3101, 3102].map((port) => `http://127.0.0.1:${port}`);
export const MOCK_URL = `http://127.0.0.1:${mockPort}`;
export const REVALIDATE_SECRET = "e2e-revalidate-secret-0123456789abcdef";
const redisUrl = process.env.CACHE_REDIS_URL ?? "redis://127.0.0.1:6379/0";
// A fresh namespace per run, so that runs never see each other's pages.
const prefix = `e2e-${Date.now().toString(36)}`;

export default defineConfig({
  testDir: "./e2e/multinode",
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { trace: "off" },
  webServer: [
    {
      command: "node e2e/mock-backend.mjs",
      url: `${MOCK_URL}/api/v1/market-data/assets`,
      reuseExistingServer: false,
      env: { MOCK_BACKEND_PORT: String(mockPort) },
    },
    ...NODES.map((url) => ({
      command: "pnpm start",
      url: `${url}/api/health/live`,
      reuseExistingServer: false,
      env: {
        BACKEND_API_URL: `${MOCK_URL}/api/v1`,
        PUBLIC_SITE_URL: url,
        CMS_API_URL: `${MOCK_URL}/cms/api`,
        REVALIDATE_SECRET,
        SITE_DETECTION: "false",
        CACHE_REDIS_URL: redisUrl,
        CACHE_KEY_PREFIX: prefix,
        PORT: new URL(url).port,
        HOSTNAME: "127.0.0.1",
      },
    })),
  ],
});
