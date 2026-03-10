"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Types ───────────────────────────────────────────────────────────

interface ForecastStage {
  stageName: string;
  dealCount: number;
  totalValue: number;
  historicalCloseRate: number;
  aiConfidenceScore: number;
  aiConfidenceReasoning: string | null;
  aiWeightedValue: number;
}

interface ForecastData {
  insufficient?: boolean;
  stages?: ForecastStage[];
  totalPipelineValue?: number;
  totalAiWeightedValue?: number;
  computedAt?: string;
}

interface ForecastViewProps {
  forecast: ForecastData;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

function confidenceColorClass(score: number): string {
  if (score >= 0.6) return "text-green-600 dark:text-green-400";
  if (score >= 0.3) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function confidenceBgClass(score: number): string {
  if (score >= 0.6) return "bg-green-500";
  if (score >= 0.3) return "bg-yellow-500";
  return "bg-red-500";
}

// ─── Component ────────────────────────────────────────────────────────

export function ForecastView({ forecast }: ForecastViewProps) {
  // ─── Empty state ──────────────────────────────────────────────────

  if (forecast.insufficient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4">
        <div className="max-w-md text-center space-y-3">
          <div className="text-4xl">📈</div>
          <h2 className="text-xl font-semibold">No forecast data yet</h2>
          <p className="text-muted-foreground">
            Pipeline forecasting requires at least one closed deal to establish historical close
            rates. Close your first deal to unlock this view.
          </p>
        </div>
      </div>
    );
  }

  const stages = forecast.stages ?? [];
  const totalValue = forecast.totalPipelineValue ?? 0;
  const weightedValue = forecast.totalAiWeightedValue ?? 0;
  const atRiskValue = totalValue - weightedValue;

  // ─── Full forecast view ───────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Pipeline Forecast</h1>
        {forecast.computedAt && (
          <p className="text-sm text-muted-foreground mt-0.5">
            Computed {new Date(forecast.computedAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
            <p className="text-sm text-muted-foreground mt-1">Naive sum (all active deals)</p>
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              AI-Weighted Forecast
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(weightedValue)}</div>
            <p className="text-sm text-muted-foreground mt-1">Confidence-adjusted value</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              At-Risk Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {formatCurrency(atRiskValue)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">Pipeline – AI weighted</p>
          </CardContent>
        </Card>
      </div>

      {/* Stage breakdown table */}
      {stages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stage Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Deals</TableHead>
                  <TableHead className="text-right">Pipeline Value</TableHead>
                  <TableHead className="text-right">Historical Rate</TableHead>
                  <TableHead className="text-right">AI Confidence</TableHead>
                  <TableHead className="text-right">AI-Weighted Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stages.map((stage) => (
                  <TableRow key={stage.stageName}>
                    <TableCell className="font-medium">
                      <div>
                        {stage.stageName}
                        {stage.aiConfidenceReasoning && (
                          <p className="text-xs text-muted-foreground font-normal mt-0.5 max-w-[200px]">
                            {stage.aiConfidenceReasoning}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{stage.dealCount}</TableCell>
                    <TableCell className="text-right">{formatCurrency(stage.totalValue)}</TableCell>
                    <TableCell className="text-right">
                      {Math.round(stage.historicalCloseRate * 100)}%
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${confidenceBgClass(stage.aiConfidenceScore)}`}
                            style={{ width: `${Math.round(stage.aiConfidenceScore * 100)}%` }}
                          />
                        </div>
                        <span className={`font-medium ${confidenceColorClass(stage.aiConfidenceScore)}`}>
                          {Math.round(stage.aiConfidenceScore * 100)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(stage.aiWeightedValue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {stages.length === 0 && (
        <Card className="bg-muted/30">
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No active deals in pipeline. Add deals with stages to see forecast.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
