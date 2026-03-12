import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Skeleton for a full-width table page (object list views) */
export function TablePageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="p-6 space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      {/* Table header */}
      <div className="flex gap-4 border-b border-border pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>

      {/* Table rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 py-2">
          {Array.from({ length: 5 }).map((_, j) => (
            <Skeleton key={j} className={cn("h-5 flex-1", j === 0 && "max-w-[200px]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton for a record detail page */
export function RecordDetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-24" />
      </div>

      {/* Record name */}
      <Skeleton className="h-9 w-64" />

      {/* Attributes grid */}
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border pt-4">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
      </div>

      {/* Content area */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

/** Skeleton for a list page (tasks, notes) */
export function ListPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="p-6 space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-5 w-10" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      {/* List items */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-5 flex-1 max-w-[400px]" />
          <Skeleton className="h-4 w-20 ml-auto" />
        </div>
      ))}
    </div>
  );
}

/** Compact skeleton for inline panels (record sidebar sections) */
export function PanelSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4", i === 0 ? "w-3/4" : i === 1 ? "w-1/2" : "w-2/3")} />
      ))}
    </div>
  );
}
