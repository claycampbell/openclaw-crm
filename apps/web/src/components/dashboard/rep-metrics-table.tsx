"use client";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export interface RepMetricsRow {
  userId: string;
  name: string;
  email: string;
  dealCount: number;
  dealValue: number;
  closedCount: number;
  closedValue: number;
  openTasks: number;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

const columnHelper = createColumnHelper<RepMetricsRow>();

const columns = [
  columnHelper.accessor("name", {
    header: "Rep",
    cell: (info) => (
      <div>
        <p className="font-medium text-sm">{info.getValue()}</p>
        <p className="text-xs text-muted-foreground">{info.row.original.email}</p>
      </div>
    ),
  }),
  columnHelper.accessor("dealCount", {
    header: "Open Deals",
    cell: (info) => (
      <span className="tabular-nums font-medium">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("dealValue", {
    header: "Pipeline Value",
    cell: (info) => (
      <span className="tabular-nums font-medium">{formatCurrency(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor("closedCount", {
    header: "Closed Won",
    cell: (info) => (
      <span className="tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("closedValue", {
    header: "Closed Value",
    cell: (info) => (
      <span className="tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
        {formatCurrency(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor("openTasks", {
    header: "Open Tasks",
    cell: (info) => (
      <span className="tabular-nums text-sm text-muted-foreground">{info.getValue()}</span>
    ),
  }),
];

interface RepMetricsTableProps {
  data: RepMetricsRow[];
}

export function RepMetricsTable({ data }: RepMetricsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "dealValue", desc: true },
  ]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
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
                colSpan={columns.length}
                className="px-4 py-8 text-center text-sm text-muted-foreground"
              >
                No team members found
              </td>
            </tr>
          )}
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border/50 hover:bg-muted/30 transition-colors last:border-0"
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
