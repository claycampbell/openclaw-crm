"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─── Types ───────────────────────────────────────────────────────────

interface RepDeviation {
  metric: string;
  repValue: number;
  baselineValue: number;
  delta: number;
  unit: string;
}

interface EnrichedRep {
  userId: string;
  displayName: string;
  closedWonCount: number;
  closedLostCount: number;
  winRate: number;
  medianDaysToClose: number | null;
  notesPerDeal: number;
  tasksPerDeal: number;
  isTopPerformer: boolean;
  deviations: RepDeviation[];
  coachingTip: string | null;
}

interface TopPerformerBaseline {
  avgWinRate: number;
  avgNotesPerDeal: number;
  avgTasksPerDeal: number;
  medianDaysToClose: number;
}

interface RepCoachingData {
  insufficient?: boolean;
  repCount?: number;
  minimumRequired?: number;
  workspaceRepCount?: number;
  topPerformerBaseline?: TopPerformerBaseline;
  reps?: EnrichedRep[];
  computedAt?: string;
}

interface RepCoachingCardsProps {
  report: RepCoachingData;
}

// ─── Component ────────────────────────────────────────────────────────

export function RepCoachingCards({ report }: RepCoachingCardsProps) {
  // ─── Empty state ──────────────────────────────────────────────────

  if (report.insufficient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4">
        <div className="max-w-md text-center space-y-3">
          <div className="text-4xl">👥</div>
          <h2 className="text-xl font-semibold">Not enough reps yet</h2>
          <p className="text-muted-foreground">
            Rep coaching requires {report.minimumRequired ?? 2}+ reps with closed deals. Current
            workspace reps with deals: {report.repCount ?? 0}.
          </p>
          <Badge variant="secondary" className="text-sm">
            {report.repCount ?? 0} / {report.minimumRequired ?? 2} reps with deals
          </Badge>
        </div>
      </div>
    );
  }

  const reps = report.reps ?? [];
  const baseline = report.topPerformerBaseline;

  // ─── Full coaching view ───────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Rep Performance Coaching</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {report.workspaceRepCount} reps analyzed
        </p>
      </div>

      {/* Top performer baseline */}
      {baseline && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Performer Baseline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <BaselineStat
                label="Win rate"
                value={`${Math.round(baseline.avgWinRate * 100)}%`}
              />
              <BaselineStat
                label="Notes/deal"
                value={baseline.avgNotesPerDeal.toFixed(1)}
              />
              <BaselineStat
                label="Tasks/deal"
                value={baseline.avgTasksPerDeal.toFixed(1)}
              />
              <BaselineStat
                label="Days to close"
                value={`${Math.round(baseline.medianDaysToClose)}d`}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rep cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {reps.map((rep) => (
          <RepCard key={rep.userId} rep={rep} />
        ))}
      </div>

      {report.computedAt && (
        <p className="text-xs text-muted-foreground text-right">
          Computed {new Date(report.computedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function RepCard({ rep }: { rep: EnrichedRep }) {
  const closedTotal = rep.closedWonCount + rep.closedLostCount;

  return (
    <Card className={rep.isTopPerformer ? "border-green-500/40" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{rep.displayName}</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              {closedTotal} closed ({rep.closedWonCount} won, {rep.closedLostCount} lost)
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-lg font-bold">
              {Math.round(rep.winRate * 100)}%
            </span>
            {rep.isTopPerformer && (
              <Badge className="bg-green-600 text-white text-xs">Top performer</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {rep.isTopPerformer ? (
          <p className="text-sm text-green-700 dark:text-green-400 font-medium">
            Top performer — keep it up!
          </p>
        ) : (
          <>
            {/* Deviation rows */}
            {rep.deviations.length > 0 ? (
              <div className="space-y-2">
                {rep.deviations.map((dev, i) => (
                  <DeviationRow key={i} deviation={dev} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No significant deviations from baseline detected.
              </p>
            )}

            {/* AI coaching tip */}
            {rep.coachingTip && (
              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-1">Coaching suggestion:</p>
                <p className="text-sm italic text-muted-foreground">{rep.coachingTip}</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DeviationRow({ deviation }: { deviation: RepDeviation }) {
  const isBelow = deviation.delta > 0; // positive delta = rep is below baseline

  // Format values based on unit
  function formatValue(value: number, unit: string): string {
    if (unit === "%") return `${Math.round(value * 100)}%`;
    if (unit === "days") return `${Math.round(value)}d`;
    return value.toFixed(1);
  }

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{deviation.metric}</span>
      <div className="flex items-center gap-1.5">
        <span className={isBelow ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}>
          {formatValue(deviation.repValue, deviation.unit)}
        </span>
        <span className="text-muted-foreground text-xs">vs</span>
        <span className="text-muted-foreground">
          {formatValue(deviation.baselineValue, deviation.unit)}
        </span>
        <span
          className={`text-xs font-medium ${
            isBelow ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
          }`}
        >
          ({isBelow ? "-" : "+"}{formatValue(Math.abs(deviation.delta), deviation.unit)})
        </span>
      </div>
    </div>
  );
}

function BaselineStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-0.5">{value}</p>
    </div>
  );
}
