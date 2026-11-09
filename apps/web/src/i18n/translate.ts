import en from "./messages/en.json";
import fa from "./messages/fa.json";
import { textDirection, type Locale } from "./locales";

/** The English catalog is the reference: every locale has exactly its keys. */
export type MessageKey = keyof typeof en;
export type Catalog = Record<MessageKey, string>;

export const CATALOGS: Record<Locale, Catalog> = { en, fa };

export type Params = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: Params) => string;

// Unicode first strong isolate and pop directional isolate.
const FSI = "⁨";
const PDI = "⁩";

/**
 * Fills `{name}` placeholders. In an RTL locale every value is wrapped in
 * Unicode isolates, so that `BTC/USDT`, an address, or a number keeps its own
 * direction inside the sentence (the same rule as the backend). A
 * placeholder without a value is left as it is, so a missing parameter is
 * visible rather than silently empty.
 */
export function format(template: string, params: Params | undefined, rtl: boolean): string {
  if (!params) return template;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return rtl ? `${FSI}${value}${PDI}` : String(value);
  });
}

/** A translator for one locale. */
export function createTranslator(locale: Locale): Translate {
  const catalog = CATALOGS[locale];
  const rtl = textDirection(locale) === "rtl";
  return (key, params) => format(catalog[key] ?? en[key], params, rtl);
}
