import { createServer, type Server } from "node:http";
import type { Pool } from "./db.ts";
import type { Metrics } from "./metrics.ts";

/**
 * Health and metrics for the orchestrator:
 * - GET /health/live: the process is up;
 * - GET /health/ready: 503 while PostgreSQL does not answer or the worker is stopping;
 * - GET /metrics: Prometheus counters.
 */
export function startServer(
  port: number,
  deps: { pool: Pool; metrics: Metrics; running: () => boolean },
): Server {
  const server = createServer(async (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    if (req.method !== "GET") return json(405, { error: "method_not_allowed" });
    if (path === "/health/live") return json(200, { status: "ok" });
    if (path === "/health/ready") {
      if (!deps.running()) return json(503, { status: "draining" });
      try {
        await deps.pool.query("SELECT 1");
        return json(200, { status: "ok" });
      } catch {
        return json(503, { status: "database_unavailable" });
      }
    }
    if (path === "/metrics") {
      res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
      return res.end(deps.metrics.render());
    }
    json(404, { error: "not_found" });
  });
  server.listen(port, "0.0.0.0");
  return server;
}
