import { intlTag, type Locale } from "./locales";

export type Calendar = "persian" | "gregory";

/** The calendar a locale shows dates in by default. */
export function defaultCalendar(locale: Locale): Calendar {
  return locale === "fa" ? "persian" : "gregory";
}

export function formatNumber(
  locale: Locale,
  value: number,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(intlTag(locale), options).format(value);
}

/** A change such as `+1.23%`, from a ratio (0.0123). */
export function formatPercentChange(locale: Locale, ratio: number, fractionDigits = 2): string {
  return formatNumber(locale, ratio, {
    style: "percent",
    signDisplay: "exceptZero",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

const CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

/**
 * A price in a fiat or crypto quote. Codes that are not ISO 4217 currencies
 * (USDT, BTC, IRT) are shown as a number followed by the code.
 */
export function formatPrice(
  locale: Locale,
  value: number,
  quote: string,
  options: Intl.NumberFormatOptions = {},
): string {
  const digits = value !== 0 && Math.abs(value) < 1 ? { maximumSignificantDigits: 4 } : {};
  if (CURRENCIES.has(quote.toUpperCase())) {
    return formatNumber(locale, value, {
      style: "currency",
      currency: quote.toUpperCase(),
      currencyDisplay: "narrowSymbol",
      ...digits,
      ...options,
    });
  }
  const number = formatNumber(locale, value, { maximumFractionDigits: 2, ...digits, ...options });
  return `${number} ${quote}`;
}

export function formatDate(
  locale: Locale,
  date: Date | string | number,
  options: Intl.DateTimeFormatOptions & { calendar?: Calendar } = { dateStyle: "long" },
): string {
  const { calendar = defaultCalendar(locale), ...rest } = options;
  return new Intl.DateTimeFormat(`${intlTag(locale)}-u-ca-${calendar}`, rest).format(
    new Date(date),
  );
}
