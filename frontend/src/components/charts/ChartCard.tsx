import { useState } from "react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/EmptyState";

export interface TableColumn<T> {
  header: string;
  value: (row: T) => ReactNode;
  align?: "left" | "right";
}

interface ChartCardProps<T> {
  title: string;
  subtitle?: string;
  /** Data behind the chart, so the table view can show the same numbers. */
  rows: T[];
  columns: TableColumn<T>[];
  children: ReactNode;
  action?: ReactNode;
}

/**
 * Wraps a chart with its title and a table view of the same data.
 *
 * The table is not decoration: it is the accessible path to every value, which
 * is what lets the charts use hues that would otherwise be too light to rely on
 * alone, and what makes the numbers readable to a screen reader.
 */
export function ChartCard<T>({
  title,
  subtitle,
  rows,
  columns,
  children,
  action,
}: ChartCardProps<T>) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          <button
            onClick={() => setShowTable((open) => !open)}
            aria-pressed={showTable}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            {showTable ? "Show chart" : "Show table"}
          </button>
        </div>
      </header>

      {rows.length === 0 ? (
        <EmptyState title="No data for this period" />
      ) : showTable ? (
        <div className="max-h-80 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.header}
                    className={`py-2 font-semibold ${column.align === "right" ? "text-right" : ""}`}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((column) => (
                    <td
                      key={column.header}
                      className={`py-2 text-slate-700 ${
                        column.align === "right" ? "text-right" : ""
                      }`}
                    >
                      {column.value(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/** Shared tooltip shell, so every chart hovers the same way. */
export function ChartTooltip({
  label,
  entries,
}: {
  label: ReactNode;
  entries: { name: string; value: string; color?: string }[];
}) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="font-semibold text-slate-900">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {entries.map((entry) => (
          <li key={entry.name} className="flex items-center gap-2">
            {entry.color && (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
            )}
            <span className="text-slate-500">{entry.name}</span>
            <span className="ml-auto font-medium text-slate-900">{entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
