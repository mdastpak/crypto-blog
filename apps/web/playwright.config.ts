import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
const mockPort = 3199;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/mock-backend.mjs",
      url: `http://127.0.0.1:${mockPort}/api/v1/market-data/assets`,
      reuseExistingServer: !process.env.CI,
      env: { MOCK_BACKEND_PORT: String(mockPort) },
    },
    {
      // Runs the production build, so the smoke test covers what is deployed.
      command: "pnpm start",
      url: `${baseURL}/api/health/live`,
      reuseExistingServer: !process.env.CI,
      env: {
        BACKEND_API_URL: `http://127.0.0.1:${mockPort}/api/v1`,
        PUBLIC_SITE_URL: baseURL,
        DEPLOYMENT_REGION: "ir",
        DESIGN_GALLERY: "true",
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
      },
    },
  ],
});
