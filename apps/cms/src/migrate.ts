/**
 * Runs the pending migrations once, under a PostgreSQL advisory lock, so that
 * a release job started on several nodes (or twice) never runs them
 * concurrently: the others wait, then find nothing to do.
 *
 *   pnpm --filter cms migrate
 */
import config from "@payload-config";
import { getPayload } from "payload";
import { migrations } from "./migrations";

// Any fixed 64-bit key; it names this lock among the database's advisory locks.
const LOCK_KEY = 7_160_220_261_109;

const payload = await getPayload({ config });
const db = payload.db as unknown as {
  pool: {
    connect(): Promise<{ query(sql: string, args?: unknown[]): Promise<unknown>; release(): void }>;
  };
};
const client = await db.pool.connect();
try {
  payload.logger.info("waiting for the migration lock");
  await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
  await payload.db.migrate({ migrations: migrations as never });
  payload.logger.info("migrations are up to date");
} finally {
  await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
  client.release();
}
process.exit(0);
