import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

/** The trail to the current page; the last item is the page itself. */
export function Breadcrumbs({ items, label }: { items: Crumb[]; label: string }) {
  return (
    <nav aria-label={label} className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${index}-${item.label}`} className="flex items-center gap-1">
              {item.href && !last ? (
                <Link href={item.href} className="hover:text-text hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "text-text" : ""}>
                  {item.label}
                </span>
              )}
              {!last && (
                // U+203A is a mirrored character: the bidi algorithm flips it in RTL.
                <span aria-hidden="true">›</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
