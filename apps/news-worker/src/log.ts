const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type Level = keyof typeof LEVELS;

let threshold: number = LEVELS.info;

export function setLogLevel(level: Level): void {
  threshold = LEVELS[level];
}

/** One JSON line per event, for the log pipeline. */
export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}
