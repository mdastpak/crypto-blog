import type { Locale } from "@/i18n/locales";
import { formatDate, formatPrice } from "@/i18n/format";

export interface ChartPoint {
  time: string;
  close: number;
}

const WIDTH = 720;
const HEIGHT = 240;
const PAD = 8;

export function chartPath(points: ChartPoint[], width = WIDTH, height = HEIGHT): string {
  if (points.length < 2) return "";
  const closes = points.map((p) => p.close);
  const min = Math.min(...closes);
  const span = Math.max(...closes) - min || 1;
  const step = (width - PAD * 2) / (points.length - 1);
  return points
    .map((p, i) => {
      const x = PAD + i * step;
      const y = PAD + (height - PAD * 2) * (1 - (p.close - min) / span);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * A server-rendered line chart of closing prices: no JavaScript, readable by
 * crawlers, with its range written out for screen readers. Time runs left to
 * right in every locale.
 */
export function PriceChart({
  points,
  quote,
  locale,
  label,
}: {
  points: ChartPoint[];
  quote: string;
  locale: Locale;
  label: string;
}) {
  const closes = points.map((p) => p.close);
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 2) return null;
  const tone = last.close >= first.close ? "text-up" : "text-down";
  const low = Math.min(...closes);
  const high = Math.max(...closes);
  const range = `${formatDate(locale, first.time, { dateStyle: "medium" })} – ${formatDate(
    locale,
    last.time,
    { dateStyle: "medium" },
  )}`;
  return (
    <figure className="flex flex-col gap-2">
      <svg
        role="img"
        aria-label={`${label}. ${range}: ${formatPrice(locale, low, quote)} – ${formatPrice(locale, high, quote)}`}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={`h-auto w-full ${tone}`}
        preserveAspectRatio="none"
      >
        <path
          d={chartPath(points)}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="flex justify-between text-xs text-muted tabular">
        <span>{range}</span>
        <span>
          {formatPrice(locale, low, quote)} – {formatPrice(locale, high, quote)}
        </span>
      </figcaption>
    </figure>
  );
}
