/**
 * Applies the news store's migrations once per release, under a lock.
 *
 *   pnpm --filter news-worker migrate
 */
import { ConfigError } from "./config.ts";
import { createPool, migrate } from "./db.ts";
import { log } from "./log.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(new ConfigError(["DATABASE_URL is required"]).message);
  process.exit(1);
}
const pool = createPool(url, 1);
try {
  const applied = await migrate(pool);
  log("info", applied.length ? "migrations applied" : "migrations are up to date", { applied });
} finally {
  await pool.end();
}
