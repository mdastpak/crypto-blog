import { cx } from "@/components/ui/cx";
import { getConfig } from "@/lib/config";
import { coinLogoPath } from "@/lib/market/logos";

/**
 * The logo of an asset, served by this app's /coin-logo route from its
 * source (lib/market/logos.ts), or its first letter when there is none or
 * its source is not an allowed host. The browser never fetches the
 * source's host itself (#31).
 */
export function CoinLogo({
  src,
  symbol,
  size = 28,
  className,
  hosts,
}: {
  /** The logo's source URL, from the backend. */
  src?: string;
  symbol: string;
  size?: number;
  className?: string;
  /** The allowed hosts; COIN_LOGO_HOSTS when not given. */
  hosts?: readonly string[];
}) {
  const path = src ? coinLogoPath(src, hosts ?? getConfig().coinLogoHosts) : undefined;
  if (!path) {
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
    // eslint-disable-next-line @next/next/no-img-element -- already a small cached image of this app; next/image would fetch it a second time
    <img
      src={path}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={cx("shrink-0 rounded-full", className)}
    />
  );
}
