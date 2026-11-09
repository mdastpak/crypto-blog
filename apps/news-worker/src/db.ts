import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export type Pool = pg.Pool;

export function createPool(connectionString: string, max = 10): pg.Pool {
  return new pg.Pool({ connectionString, max, idleTimeoutMillis: 30_000 });
}

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
// Any fixed 64-bit key; it names this lock among the database's advisory locks.
const LOCK_KEY = 7_160_220_261_114;

async function migrationFiles(): Promise<string[]> {
  return (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
}

/**
 * Applies pending migrations in order, each in a transaction, under an
 * advisory lock: a release job started on several nodes, or twice, applies
 * them once, and the others find nothing to do. Returns the applied names.
 */
export async function migrate(pool: pg.Pool): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(
      "CREATE TABLE IF NOT EXISTS news_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const done = new Set(
      (await client.query<{ name: string }>("SELECT name FROM news_schema_migrations")).rows.map(
        (r) => r.name,
      ),
    );
    for (const file of await migrationFiles()) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO news_schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      applied.push(file);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    client.release();
  }
  return applied;
}

/** The migrations not applied yet; the worker refuses to start while any are. */
export async function pendingMigrations(pool: pg.Pool): Promise<string[]> {
  const exists = await pool.query("SELECT to_regclass('news_schema_migrations') AS t");
  const done = exists.rows[0]?.t
    ? new Set(
        (await pool.query<{ name: string }>("SELECT name FROM news_schema_migrations")).rows.map(
          (r) => r.name,
        ),
      )
    : new Set<string>();
  return (await migrationFiles()).filter((f) => !done.has(f));
}
