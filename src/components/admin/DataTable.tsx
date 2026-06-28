/**
 * Lightweight responsive data table wrapper for admin list screens.
 */
import * as React from "react";
import { Card } from "@/components/ui";

export interface Column<T> {
  /** Column header text (PT-BR). */
  header: string;
  /** Cell renderer for a given row. */
  cell: (row: T) => React.ReactNode;
  /** Optional extra classes for the cell/header (e.g. alignment, width). */
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getKey,
  emptyMessage = "Nenhum registro encontrado.",
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  emptyMessage?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-navy-50/40 text-left">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] ${col.className ?? ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-[var(--color-muted)]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={getKey(row)} className="border-b border-line last:border-0 hover:bg-navy-50/30">
                  {columns.map((col, i) => (
                    <td key={i} className={`px-4 py-3 align-middle text-ink ${col.className ?? ""}`}>
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
