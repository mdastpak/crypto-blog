import { formatPercentChange } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { cx } from "./cx";

/**
 * A signed change (`+1.23%`) in the brand's up or down color. The sign is
 * always shown, so the color is never the only signal.
 */
export function PriceChange({ locale, ratio }: { locale: Locale; ratio: number }) {
  const tone = ratio > 0 ? "text-up" : ratio < 0 ? "text-down" : "text-muted";
  return (
    <span className={cx("tabular font-medium", tone)} dir="ltr">
      {formatPercentChange(locale, ratio)}
    </span>
  );
}
