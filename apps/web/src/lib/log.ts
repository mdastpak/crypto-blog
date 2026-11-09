/**
 * Structured logs: one JSON object per line on stdout (info and below) or
 * stderr (warn and error), with a level, a message, and fields. Collectors
 * read them as they are; LOG_LEVEL drops the levels below it.
 *
 * Free of `server-only` and of the config module, so that the cache
 * handler, which Next.js loads outside the app bundle, can use it too.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const level = process.env.LOG_LEVEL as LogLevel | undefined;
  return ORDER[level ?? "info"] ?? ORDER.info;
}

export function log(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }, (_k, v) =>
    v instanceof Error ? { name: v.name, message: v.message } : v,
  );
  if (ORDER[level] >= ORDER.warn) process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => log("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => log("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => log("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => log("error", msg, fields),
};
