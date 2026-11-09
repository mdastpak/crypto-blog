import type { ReactNode } from "react";
import { cx } from "./cx";

export interface Column<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Numbers align to the end and use tabular digits. */
  numeric?: boolean;
  /** Hidden below the `sm` breakpoint. */
  hideOnMobile?: boolean;
}

export interface DataTableProps<Row> {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  empty?: ReactNode;
}

/** A table that scrolls sideways on small screens with a sticky header. */
export function DataTable<Row>({ caption, columns, rows, rowKey, empty }: DataTableProps<Row>) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface-muted text-muted">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cx(
                  "px-3 py-2 font-medium whitespace-nowrap",
                  col.numeric ? "text-end" : "text-start",
                  col.hideOnMobile && "hidden sm:table-cell",
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-border hover:bg-surface">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cx(
                    "px-3 py-2 whitespace-nowrap",
                    col.numeric ? "tabular text-end" : "text-start",
                    col.hideOnMobile && "hidden sm:table-cell",
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
