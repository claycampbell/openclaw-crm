"use client";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DealRow {
  id: string;
  displayName: string;
  stage: string | null;
  value: number | null;
  ownerName: string | null;
  closeDate: string | null;
  updatedAt: Date | string;
}

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string | null | Date): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

const columnHelper = createColumnHelper<DealRow>();

const allColumns = [
  columnHelper.accessor("displayName", {
    id: "displayName",
    header: "Deal",
    cell: (info) => (
      <Link
        href={`/objects/deals/${info.row.original.id}`}
        className="font-medium hover:underline text-foreground"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("stage", {
    id: "stage",
    header: "Stage",
    cell: (info) => {
      const stage = info.getValue();
      return stage ? (
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {stage}
        </span>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      );
    },
  }),
  columnHelper.accessor("value", {
    id: "value",
    header: "Value",
    cell: (info) => (
      <span className="font-medium tabular-nums">{formatCurrency(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor("ownerName", {
    id: "ownerName",
    header: "Owner",
    cell: (info) => (
      <span className="text-sm text-muted-foreground">{info.getValue() ?? "—"}</span>
    ),
  }),
  columnHelper.accessor("closeDate", {
    id: "closeDate",
    header: "Close Date",
    cell: (info) => (
      <span className="text-sm tabular-nums">{formatDate(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor("updatedAt", {
    id: "updatedAt",
    header: "Updated",
    cell: (info) => (
      <span className="text-sm text-muted-foreground tabular-nums">
        {formatDate(info.getValue())}
      </span>
    ),
  }),
];

interface PipelineTableProps {
  deals: DealRow[];
  className?: string;
  showOwner?: boolean;
}

export function PipelineTable({ deals, className, showOwner = true }: PipelineTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const visibleColumns = showOwner
    ? allColumns
    : allColumns.filter((c) => c.id !== "ownerName");

  const table = useReactTable({
    data: deals,
    columns: visibleColumns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className={cn("space-y-3", className)}>
      <input
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        placeholder="Search deals..."
        className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border bg-muted/30">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <span className="ml-1">
                            {header.column.getIsSorted() === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : header.column.getIsSorted() === "desc" ? (
                              <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </span>
                        )}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td
                  colSpan={visibleColumns.length}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No deals found
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border/50 hover:bg-muted/30 transition-colors last:border-0"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-2.5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {table.getFilteredRowModel().rows.length} of {deals.length} deal{deals.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
