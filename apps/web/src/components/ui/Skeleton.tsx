import { cx } from "./cx";

/** A placeholder while content loads; hidden from assistive technology. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx("block animate-pulse rounded bg-surface-muted", className)}
    />
  );
}
