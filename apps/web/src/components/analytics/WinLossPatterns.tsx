"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ─── Types ───────────────────────────────────────────────────────────

interface WinLossPattern {
  label: string;
  finding: string;
  wonCount: number;
  lostCount: number;
  winRate: number;
}

interface WinLossData {
  insufficient?: boolean;
  closedCount?: number;
  minimumRequired?: number;
  closedWonCount?: number;
  closedLostCount?: number;
  overallWinRate?: number;
  patterns?: WinLossPattern[];
  aiNarrative?: string | null;
  computedAt?: string;
  dataRange?: { from: string; to: string };
}

type TimeRange = "90d" | "6m" | "all";

interface WinLossPatternsProps {
  initialData: WinLossData;
}

// ─── Component ────────────────────────────────────────────────────────

export function WinLossPatterns({ initialData }: WinLossPatternsProps) {
  const [data, setData] = useState<WinLossData>(initialData);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [loading, setLoading] = useState(false);

  async function fetchData(range: TimeRange) {
    setLoading(true);
    try {
      const url =
        range === "all"
          ? "/api/v1/analytics/win-loss"
          : `/api/v1/analytics/win-loss?since=${range}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleTimeRange(range: TimeRange) {
    setTimeRange(range);
    fetchData(range);
  }

  // ─── Empty state (data volume gate) ──────────────────────────────

  if (data.insufficient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4">
        <div className="max-w-md text-center space-y-3">
          <div className="text-4xl">📊</div>
          <h2 className="text-xl font-semibold">Not enough data yet</h2>
          <p className="text-muted-foreground">
            Win/loss analysis requires at least {data.minimumRequired} closed deals. You currently
            have {data.closedCount ?? 0}. Keep closing deals — this dashboard unlocks
            automatically.
          </p>
          <Badge variant="secondary" className="text-sm">
            {data.closedCount ?? 0} / {data.minimumRequired ?? 30} closed deals
          </Badge>
        </div>
      </div>
    );
  }

  // ─── Full analytics view ──────────────────────────────────────────

  const won = data.closedWonCount ?? 0;
  const lost = data.closedLostCount ?? 0;
  const winRate = data.overallWinRate ?? 0;
  const patterns = data.patterns ?? [];

  return (
    <div className="space-y-6 p-6">
      {/* Header + time range */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Win/Loss Analysis</h1>
          {data.dataRange && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {new Date(data.dataRange.from).toLocaleDateString()} –{" "}
              {new Date(data.dataRange.to).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Time range buttons */}
        <div className="flex gap-1 border border-border rounded-lg p-1">
          {(["90d", "6m", "all"] as TimeRange[]).map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? "secondary" : "ghost"}
              size="sm"
              onClick={() => handleTimeRange(range)}
              disabled={loading}
              className="text-xs"
            >
              {range === "90d" ? "Last 90 days" : range === "6m" ? "Last 6 months" : "All time"}
            </Button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground animate-pulse">Updating...</div>
      )}

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{Math.round(winRate * 100)}%</div>
            <p className="text-sm text-muted-foreground mt-1">
              {won} won, {lost} lost
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Deals Won
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">{won}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Deals Lost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">{lost}</div>
          </CardContent>
        </Card>
      </div>

      {/* AI Narrative */}
      {data.aiNarrative ? (
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              AI Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <blockquote className="text-sm leading-relaxed italic">{data.aiNarrative}</blockquote>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-muted/30">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              Configure an OpenRouter API key in Settings to enable AI narrative summaries.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pattern cards */}
      {patterns.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Patterns</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {patterns.map((pattern, i) => {
              const total = pattern.wonCount + pattern.lostCount;
              const wonPct = total > 0 ? Math.round((pattern.wonCount / total) * 100) : 0;
              const lostPct = 100 - wonPct;

              return (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        {pattern.label}
                      </Badge>
                      <span className="text-sm font-semibold">
                        {Math.round(pattern.winRate * 100)}% win rate
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm">{pattern.finding}</p>

                    {/* Mini win/loss bar */}
                    <div className="space-y-1">
                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="bg-green-500 h-full transition-all"
                          style={{ width: `${wonPct}%` }}
                        />
                        <div
                          className="bg-red-400 h-full transition-all"
                          style={{ width: `${lostPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{pattern.wonCount} won</span>
                        <span>{pattern.lostCount} lost</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {patterns.length === 0 && !loading && (
        <Card className="bg-muted/30">
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No significant patterns detected yet. Add more deal data (amount, stage history)
              to surface patterns.
            </p>
          </CardContent>
        </Card>
      )}

      {data.computedAt && (
        <p className="text-xs text-muted-foreground text-right">
          Computed {new Date(data.computedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
