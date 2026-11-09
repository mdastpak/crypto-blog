import { cx } from "./cx";

export interface SparklineProps {
  values: number[];
  label: string;
  width?: number;
  height?: number;
  className?: string;
}

/** The points of a polyline that fits `values` into the box. */
export function sparklinePoints(values: number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  return values
    .map((v, i) => `${(i * step).toFixed(2)},${(height - ((v - min) / span) * height).toFixed(2)}`)
    .join(" ");
}

/**
 * A small price line. Time runs left to right in every locale, as on
 * financial charts; SVG coordinates are not mirrored in RTL, so this holds
 * without help. Its color follows the trend.
 */
export function Sparkline({ values, label, width = 96, height = 32, className }: SparklineProps) {
  const first = values[0] ?? 0;
  const last = values.at(-1) ?? 0;
  const tone = last > first ? "text-up" : last < first ? "text-down" : "text-muted";
  return (
    <svg
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cx(tone, className)}
    >
      <polyline
        points={sparklinePoints(values, width, height)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
