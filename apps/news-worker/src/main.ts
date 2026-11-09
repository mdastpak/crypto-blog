/**
 * The news worker: collects news from the sources file into PostgreSQL.
 * Any number of nodes may run it against one database (leases).
 */
import { CatalogCache } from "./coins.ts";
import { ConfigError, parseConfig } from "./config.ts";
import { createPool, pendingMigrations } from "./db.ts";
import { PoliteHttp } from "./http.ts";
import { log, setLogLevel } from "./log.ts";
import { Metrics } from "./metrics.ts";
import { startServer } from "./server.ts";
import { loadSources, syncSources } from "./sources.ts";
import { Worker } from "./worker.ts";

let config;
try {
  config = parseConfig(process.env);
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
}
setLogLevel(config.logLevel);

const pool = createPool(config.databaseUrl, config.concurrency + 2);
const pending = await pendingMigrations(pool);
if (pending.length) {
  log("error", "the database needs migrations; run `pnpm --filter news-worker migrate`", {
    pending,
  });
  process.exit(1);
}
await syncSources(pool, await loadSources(config.sourcesFile));

const metrics = new Metrics();
const http = new PoliteHttp({
  userAgent: config.userAgent,
  timeoutMs: config.fetchTimeoutMs,
  maxBytes: config.maxFeedBytes,
  hostMinIntervalMs: config.hostMinIntervalMs,
  proxy: config.httpProxy,
});
const worker = new Worker({
  pool,
  http,
  catalog: new CatalogCache(config.backendApiUrl),
  metrics,
  config,
});
const server = startServer(config.port, { pool, metrics, running: () => worker.running });
worker.start();
log("info", "news worker started", {
  worker: config.workerId,
  region: config.region,
  egress: config.httpProxy ? "proxy" : "direct",
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", "stopping", { signal });
  await worker.stop();
  server.close();
  await http.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
