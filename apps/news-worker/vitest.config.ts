import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The integration tests share one database.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
