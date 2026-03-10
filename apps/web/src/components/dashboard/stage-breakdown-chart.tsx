"use client";

interface StageBar {
  stage: string;
  count: number;
  value: number;
}

interface StageBreakdownChartProps {
  data: StageBar[];
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function StageBreakdownChart({ data }: StageBreakdownChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
        No deal data
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((item) => {
        const pct = maxValue > 0 ? Math.max((item.value / maxValue) * 100, 2) : 2;
        return (
          <div key={item.stage} className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium truncate max-w-[120px]" title={item.stage}>
                {item.stage}
              </span>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>{item.count} deal{item.count !== 1 ? "s" : ""}</span>
                <span className="font-medium text-foreground w-16 text-right tabular-nums">
                  {formatCurrency(item.value)}
                </span>
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/70 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
