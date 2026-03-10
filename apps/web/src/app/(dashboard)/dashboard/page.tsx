"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PipelineTable, type DealRow } from "@/components/dashboard/pipeline-table";
import { StageBreakdownChart } from "@/components/dashboard/stage-breakdown-chart";
import { RepMetricsTable, type RepMetricsRow } from "@/components/dashboard/rep-metrics-table";
import {
  BarChart2,
  TrendingUp,
  Users,
  DollarSign,
  CheckSquare,
  Clock,
  FileCheck,
  Inbox,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type DashboardView = "rep" | "manager" | "leadership";

interface RepData {
  myDeals: DealRow[];
  openTaskCount: number;
  pendingApprovalCount: number;
  pendingAssetCount: number;
  dealValueTotal: number;
  stageBreakdown: { stage: string; count: number; value: number }[];
}

interface ManagerData {
  teamDeals: DealRow[];
  teamMetrics: RepMetricsRow[];
  totalPipelineValue: number;
  totalDeals: number;
  stageBreakdown: { stage: string; count: number; value: number }[];
  pendingApprovals: number;
}

interface LeadershipData {
  totalPipelineValue: number;
  weightedPipelineValue: number;
  totalDeals: number;
  closedWonValue: number;
  closedWonCount: number;
  stageDistribution: { stage: string; count: number; value: number; weight: number }[];
  topDeals: DealRow[];
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("rounded-lg p-2 shrink-0", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ViewToggle({
  view,
  isAdmin,
  onChange,
}: {
  view: DashboardView;
  isAdmin: boolean;
  onChange: (v: DashboardView) => void;
}) {
  const views: { id: DashboardView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "rep", label: "My Pipeline", icon: TrendingUp },
    ...(isAdmin
      ? [
          { id: "manager" as const, label: "Team View", icon: Users },
          { id: "leadership" as const, label: "Leadership", icon: BarChart2 },
        ]
      : []),
  ];

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
      {views.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            view === id
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [view, setView] = useState<DashboardView>("rep");
  const [data, setData] = useState<RepData | ManagerData | LeadershipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadDashboard = useCallback(
    async (selectedView: DashboardView) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/dashboard?view=${selectedView}`);
        if (!res.ok) return;
        const json = await res.json();
        setData(json.data?.data ?? null);
        setIsAdmin(json.data?.view !== "rep" || selectedView === "rep");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Check if admin by attempting manager view
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/v1/dashboard?view=manager");
      if (res.ok) {
        const json = await res.json();
        if (json.data?.view === "manager") setIsAdmin(true);
      }
    })();
  }, []);

  useEffect(() => {
    loadDashboard(view);
  }, [view, loadDashboard]);

  async function handleViewChange(newView: DashboardView) {
    setView(newView);
    // Save preference
    await fetch("/api/v1/dashboard/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ view: newView }),
    });
  }

  return (
    <div className="p-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {view === "rep" && "Your personal pipeline and activity"}
            {view === "manager" && "Team pipeline overview and rep metrics"}
            {view === "leadership" && "Executive pipeline summary and forecasting"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ViewToggle view={view} isAdmin={isAdmin} onChange={handleViewChange} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadDashboard(view)}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading && !data ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          Loading dashboard...
        </div>
      ) : (
        <>
          {view === "rep" && data && <RepView data={data as RepData} />}
          {view === "manager" && data && <ManagerView data={data as ManagerData} />}
          {view === "leadership" && data && <LeadershipView data={data as LeadershipData} />}
        </>
      )}
    </div>
  );
}

// ─── Rep View ────────────────────────────────────────────────────────────────

function RepView({ data }: { data: RepData }) {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="Pipeline Value"
          value={formatCurrency(data.dealValueTotal)}
          color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
        <StatCard
          icon={TrendingUp}
          label="Open Deals"
          value={data.myDeals.length}
          color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <StatCard
          icon={CheckSquare}
          label="Open Tasks"
          value={data.openTaskCount}
          color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
        <StatCard
          icon={Clock}
          label="Pending Approvals"
          value={data.pendingApprovalCount}
          color="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
        />
      </div>

      {/* Stage breakdown + draft queue */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Stage Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <StageBreakdownChart data={data.stageBreakdown} />
          </CardContent>
        </Card>

        {data.pendingAssetCount > 0 && (
          <Card className="md:col-span-2 border-amber-200/50 bg-amber-50/20 dark:border-amber-900/30 dark:bg-amber-950/10">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-sm font-medium">Draft Queue</CardTitle>
                <span className="ml-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  {data.pendingAssetCount} pending
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                You have {data.pendingAssetCount} AI-generated draft{data.pendingAssetCount !== 1 ? "s" : ""} waiting for your review.
              </p>
              <a
                href="/approvals"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400 hover:underline"
              >
                <FileCheck className="h-4 w-4" />
                Review drafts
              </a>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pipeline table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">My Deals</CardTitle>
        </CardHeader>
        <CardContent>
          <PipelineTable deals={data.myDeals} showOwner={false} />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Manager View ─────────────────────────────────────────────────────────────

function ManagerView({ data }: { data: ManagerData }) {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="Total Pipeline"
          value={formatCurrency(data.totalPipelineValue)}
          color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
        <StatCard
          icon={TrendingUp}
          label="Total Deals"
          value={data.totalDeals}
          color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <StatCard
          icon={Users}
          label="Team Size"
          value={data.teamMetrics.length}
          color="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
        />
        <StatCard
          icon={Clock}
          label="Pending Approvals"
          value={data.pendingApprovals}
          color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Pipeline by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            <StageBreakdownChart data={data.stageBreakdown} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Rep Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <RepMetricsTable data={data.teamMetrics} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Team Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <PipelineTable deals={data.teamDeals} showOwner={true} />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Leadership View ──────────────────────────────────────────────────────────

function LeadershipView({ data }: { data: LeadershipData }) {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="Active Pipeline"
          value={formatCurrency(data.totalPipelineValue)}
          color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <StatCard
          icon={BarChart2}
          label="Weighted Pipeline"
          value={formatCurrency(data.weightedPipelineValue)}
          color="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
        />
        <StatCard
          icon={TrendingUp}
          label="Open Deals"
          value={data.totalDeals}
          color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
        <StatCard
          icon={CheckSquare}
          label="Closed Won"
          value={`${data.closedWonCount} (${formatCurrency(data.closedWonValue)})`}
          color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Stage Distribution</CardTitle>
            <p className="text-xs text-muted-foreground">With win probability weights</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.stageDistribution.map((s) => (
                <div key={s.stage} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium truncate">{s.stage}</span>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{s.count}</span>
                      <span className="text-foreground font-medium tabular-nums w-14 text-right">
                        {formatCurrency(s.value)}
                      </span>
                      <span className="w-8 text-right opacity-60">{Math.round(s.weight * 100)}%</span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{
                        width: `${Math.max(
                          (s.value / Math.max(...data.stageDistribution.map((x) => x.value), 1)) * 100,
                          2
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Top Deals by Value</CardTitle>
          </CardHeader>
          <CardContent>
            <PipelineTable deals={data.topDeals} showOwner={true} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
