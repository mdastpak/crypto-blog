/**
 * Cache values as JSON. Next.js stores Buffers (RSC payloads, route bodies,
 * images) and Maps (segment data) in its cache entries, which JSON alone
 * would lose; they are written as tagged objects and read back.
 */
const BUFFER = "$b";
const MAP = "$m";

export function encode(value: unknown): string {
  return JSON.stringify(value, function (this: Record<string, unknown>, key, v: unknown) {
    // JSON.stringify calls toJSON on a Buffer before the replacer sees it.
    const raw = this[key];
    if (Buffer.isBuffer(raw)) return { [BUFFER]: raw.toString("base64") };
    if (raw instanceof Map) return { [MAP]: [...raw.entries()] };
    return v;
  });
}

export function decode<T = unknown>(text: string): T {
  return JSON.parse(text, (_key, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o);
      if (keys.length === 1 && typeof o[BUFFER] === "string") {
        return Buffer.from(o[BUFFER], "base64");
      }
      if (keys.length === 1 && Array.isArray(o[MAP]))
        return new Map(o[MAP] as [unknown, unknown][]);
    }
    return v;
  }) as T;
}
