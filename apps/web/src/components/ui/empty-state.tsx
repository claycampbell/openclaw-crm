import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ComponentType<{ className?: string }>;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon: ActionIcon = Plus,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-6 px-4 gap-2" : "py-16 px-6 gap-3",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-xl bg-muted/50",
          compact ? "h-10 w-10" : "h-12 w-12"
        )}
      >
        <Icon
          className={cn(
            "text-muted-foreground/60",
            compact ? "h-5 w-5" : "h-6 w-6"
          )}
        />
      </div>
      <div className="space-y-1">
        <p
          className={cn(
            "font-medium text-foreground",
            compact ? "text-sm" : "text-base"
          )}
        >
          {title}
        </p>
        <p
          className={cn(
            "text-muted-foreground max-w-[280px]",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {description}
        </p>
      </div>
      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          size={compact ? "sm" : "default"}
          variant="outline"
          className="mt-1"
        >
          <ActionIcon className="mr-1.5 h-4 w-4" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
