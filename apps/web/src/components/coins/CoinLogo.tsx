import { cx } from "@/components/ui/cx";

/**
 * The logo of an asset from the catalog (an https URL of the data source),
 * or its first letter when there is none. No referrer is sent to the source.
 */
export function CoinLogo({
  src,
  symbol,
  size = 28,
  className,
}: {
  src?: string;
  symbol: string;
  size?: number;
  className?: string;
}) {
  if (!src) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className={cx(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-bold text-muted",
          className,
        )}
      >
        {symbol.slice(0, 1)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- third-party logos of any host; next/image would need every host allowed
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={cx("shrink-0 rounded-full", className)}
    />
  );
}
