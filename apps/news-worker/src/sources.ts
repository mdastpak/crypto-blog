import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Pool } from "./db.ts";

export const PROVIDERS = ["rss"] as const;

export const sourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,64}$/, "must be lowercase letters, digits, and dashes"),
  name: z.string().min(1).max(200),
  kind: z.enum(PROVIDERS).default("rss"),
  url: z.url({ protocol: /^https?$/ }),
  homepage: z.url({ protocol: /^https?$/ }).optional(),
  language: z.enum(["fa", "en"]),
  region: z.enum(["ir", "global"]),
  /**
   * What the source's terms let us keep: `headline` (title, a short summary,
   * link, and metadata; the default) or `full` (the text too).
   */
  license: z.enum(["headline", "full"]).default("headline"),
  intervalMinutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .default(15),
  enabled: z.boolean().default(true),
});
export type Source = z.infer<typeof sourceSchema>;

const fileSchema = z.object({ sources: z.array(sourceSchema) }).superRefine((file, ctx) => {
  const seen = new Set<string>();
  file.sources.forEach((s, i) => {
    if (seen.has(s.id)) {
      ctx.addIssue({ code: "custom", path: ["sources", i, "id"], message: `duplicate id ${s.id}` });
    }
    seen.add(s.id);
  });
});

/** Reads and checks the sources file; every problem is reported at once. */
export function parseSources(json: unknown): Source[] {
  const result = fileSchema.safeParse(json);
  if (!result.success) {
    throw new Error(
      `Invalid sources file:\n${result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`,
    );
  }
  return result.data.sources;
}

export async function loadSources(file: string): Promise<Source[]> {
  return parseSources(JSON.parse(await readFile(file, "utf8")));
}

/**
 * Makes the table match the file: new sources are added, changed ones
 * updated (their fetch state kept), and ones gone from the file disabled,
 * not deleted, so their items keep their source. Idempotent, so every node
 * may run it at start-up.
 */
export async function syncSources(pool: Pool, sources: Source[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const s of sources) {
      await client.query(
        `INSERT INTO news_sources (id, name, kind, url, homepage, language, region, license, interval_seconds, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, kind = EXCLUDED.kind, homepage = EXCLUDED.homepage,
           language = EXCLUDED.language, region = EXCLUDED.region, license = EXCLUDED.license,
           interval_seconds = EXCLUDED.interval_seconds, enabled = EXCLUDED.enabled,
           -- A new feed URL starts without the old one's validators.
           etag = CASE WHEN news_sources.url = EXCLUDED.url THEN news_sources.etag END,
           last_modified = CASE WHEN news_sources.url = EXCLUDED.url THEN news_sources.last_modified END,
           url = EXCLUDED.url, updated_at = now()`,
        [
          s.id,
          s.name,
          s.kind,
          s.url,
          s.homepage ?? null,
          s.language,
          s.region,
          s.license,
          s.intervalMinutes * 60,
          s.enabled,
        ],
      );
    }
    await client.query(
      "UPDATE news_sources SET enabled = false, updated_at = now() WHERE enabled AND NOT (id = ANY($1))",
      [sources.map((s) => s.id)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
