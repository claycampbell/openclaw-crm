"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table";
import type { AttributeType } from "@openclaw-crm/shared";
import { AttributeCell } from "./attribute-cell";
import { AttributeEditor } from "./attribute-editor";
import { cn } from "@/lib/utils";
import { Plus, ExternalLink, FileSpreadsheet, Trash2, Download, X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

// ─── Types ───────────────────────────────────────────────────────────

interface AttributeDef {
  id: string;
  slug: string;
  title: string;
  type: AttributeType;
  isMultiselect: boolean;
  options?: { id: string; title: string; color: string }[];
  statuses?: { id: string; title: string; color: string; isActive: boolean }[];
}

interface RecordRow {
  id: string;
  values: Record<string, unknown>;
}

interface RecordTableProps {
  attributes: AttributeDef[];
  records: RecordRow[];
  onUpdateRecord: (recordId: string, slug: string, value: unknown) => void;
  onCreateRecord: () => void;
  onDeleteRecords?: (ids: string[]) => void;
  objectSlug: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────

export function RecordTable({
  attributes,
  records,
  onUpdateRecord,
  onCreateRecord,
  onDeleteRecords,
  objectSlug,
  hasMore,
  loadingMore,
  onLoadMore,
}: RecordTableProps) {
  const router = useRouter();
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const selectedCount = selectedIds.length;

  const columns = useMemo<ColumnDef<RecordRow>[]>(() => {
    // Checkbox column
    const checkCol: ColumnDef<RecordRow> = {
      id: "_select",
      header: ({ table }) => (
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
        />
      ),
      size: 36,
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
    };

    // Open button column
    const openCol: ColumnDef<RecordRow> = {
      id: "_open",
      header: "",
      size: 40,
      cell: ({ row }) => (
        <button
          onClick={() => router.push(`/objects/${objectSlug}/${row.original.id}`)}
          className="flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </button>
      ),
    };

    const attrCols: ColumnDef<RecordRow>[] = attributes.map((attr) => ({
      id: attr.slug,
      header: attr.title,
      size: attr.type === "personal_name" ? 200 : attr.type === "text" ? 180 : 150,
      cell: ({ row }: { row: { original: RecordRow; id: string } }) => {
        const val = row.original.values[attr.slug];
        const isEditing =
          editingCell?.rowId === row.original.id &&
          editingCell?.colId === attr.slug;

        if (isEditing) {
          return (
            <div className="relative">
              <AttributeEditor
                type={attr.type}
                value={val}
                options={attr.options}
                statuses={attr.statuses}
                onSave={(newVal) => {
                  onUpdateRecord(row.original.id, attr.slug, newVal);
                  setEditingCell(null);
                }}
                onCancel={() => setEditingCell(null)}
              />
            </div>
          );
        }

        return (
          <div
            className="cursor-pointer truncate px-1"
            onClick={() =>
              setEditingCell({ rowId: row.original.id, colId: attr.slug })
            }
          >
            <AttributeCell
              type={attr.type}
              value={val}
              options={attr.options}
              statuses={attr.statuses}
            />
          </div>
        );
      },
    }));

    return [checkCol, openCol, ...attrCols];
  }, [attributes, editingCell, onUpdateRecord, objectSlug, router]);

  const table = useReactTable({
    data: records,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Bulk action toolbar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 border-b border-primary/20 bg-primary/5 px-4 py-2">
          <span className="text-sm font-medium">
            {selectedCount} selected
          </span>
          {onDeleteRecords && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => {
                onDeleteRecords(selectedIds);
                setRowSelection({});
              }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRowSelection({})}
            className="ml-auto"
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="h-9 px-3 text-left text-xs font-medium text-muted-foreground"
                    style={{ width: header.getSize() }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="group/row border-b border-border/50 hover:bg-muted/30 transition-colors"
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="h-10 px-3 text-sm"
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={attributes.length + 2}>
                  <EmptyState
                    icon={FileSpreadsheet}
                    title="No records yet"
                    description="Create your first record to get started."
                    actionLabel="New record"
                    onAction={onCreateRecord}
                    compact
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="border-t border-border flex items-center justify-center py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="text-muted-foreground hover:text-foreground"
          >
            {loadingMore ? "Loading..." : "Load more records"}
          </Button>
        </div>
      )}

      {/* Add record row */}
      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCreateRecord}
          className="text-muted-foreground hover:text-foreground"
        >
          <Plus className="mr-1 h-4 w-4" />
          New record
        </Button>
      </div>
    </div>
  );
}
