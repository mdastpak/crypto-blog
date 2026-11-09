import Link from "next/link";
import { buttonClasses } from "./Button";
import { cx } from "./cx";

export interface PaginationProps {
  label: string;
  previous?: { href: string; label: string };
  next?: { href: string; label: string };
}

/** Previous and next links for cursor pagination. */
export function Pagination({ label, previous, next }: PaginationProps) {
  if (!previous && !next) return null;
  return (
    <nav aria-label={label} className="flex justify-between gap-4">
      {previous ? (
        <Link href={previous.href} rel="prev" className={buttonClasses("secondary", "sm")}>
          <span aria-hidden="true">‹</span>
          {previous.label}
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={next.href} rel="next" className={cx(buttonClasses("secondary", "sm"))}>
          {next.label}
          <span aria-hidden="true">›</span>
        </Link>
      )}
    </nav>
  );
}
