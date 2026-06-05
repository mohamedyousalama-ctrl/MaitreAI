"use client";

import { Pencil, Trash2 } from "lucide-react";
import { EmptyState } from "./EmptyState";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface EntityTableProps<T extends { id: string }> {
  columns: Column<T>[];
  rows: T[];
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

/** Generic data table with edit/delete row actions. */
export function EntityTable<T extends { id: string }>({
  columns,
  rows,
  onEdit,
  onDelete,
  emptyTitle = "لا توجد عناصر",
  emptyDescription,
}: EntityTableProps<T>) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs text-slate-400">
            {columns.map((c) => (
              <th key={c.key} className="px-4 py-3 text-start font-medium">
                {c.header}
              </th>
            ))}
            {(onEdit || onDelete) && <th className="px-4 py-3 text-start font-medium">إجراءات</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50">
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-3 ${c.className ?? "text-slate-600"}`}>
                  {c.render(row)}
                </td>
              ))}
              {(onEdit || onDelete) && (
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(row)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-dashboard"
                        aria-label="تعديل"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(row)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"
                        aria-label="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
