"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListPageSkeleton } from "@/components/ui/page-skeleton";
import { Flame, TrendingUp, StickyNote, CheckSquare, Clock, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScoredRecord {
  id: string;
  objectSlug: string;
  objectName: string;
  name: string;
  noteCount: number;
  taskCount: number;
  completedTaskCount: number;
  lastActivityAt: string | null;
  score: number;
}

function ScoreBadge({ score }: { score: number }) {
  const level = score >= 8 ? "hot" : score >= 4 ? "warm" : "cold";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        level === "hot" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
        level === "warm" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
        level === "cold" && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
      )}
    >
      {level === "hot" && <Flame className="h-3 w-3" />}
      {level === "warm" && <TrendingUp className="h-3 w-3" />}
      {score.toFixed(1)}
    </span>
  );
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "No activity";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function HotLeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<ScoredRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/v1/activity-scores?limit=20");
        if (res.ok) {
          const data = await res.json();
          setLeads(data.data);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <ListPageSkeleton />;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Flame className="h-6 w-6 text-red-500" />
          Hot leads
        </h1>
        <p className="text-sm text-muted-foreground">
          Top 20 records ranked by activity score — notes, tasks, and recency.
        </p>
      </div>

      {leads.length === 0 ? (
        <EmptyState
          icon={Flame}
          title="No activity yet"
          description="Start adding notes and tasks to your records to see activity scores."
        />
      ) : (
        <div className="grid gap-2">
          {/* Header */}
          <div className="grid grid-cols-[2rem_1fr_5rem_5rem_5rem_6rem_4rem] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>#</span>
            <span>Record</span>
            <span className="text-center">Notes</span>
            <span className="text-center">Tasks</span>
            <span className="text-center">Done</span>
            <span className="text-center">Last activity</span>
            <span className="text-right">Score</span>
          </div>

          {leads.map((lead, i) => (
            <Card
              key={lead.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => router.push(`/objects/${lead.objectSlug}/${lead.id}`)}
            >
              <CardContent className="grid grid-cols-[2rem_1fr_5rem_5rem_5rem_6rem_4rem] gap-4 items-center py-3">
                <span className="text-sm font-medium text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium truncate">{lead.name}</p>
                  <p className="text-xs text-muted-foreground">{lead.objectName}</p>
                </div>
                <div className="text-center">
                  <span className="inline-flex items-center gap-1 text-sm">
                    <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                    {lead.noteCount}
                  </span>
                </div>
                <div className="text-center">
                  <span className="inline-flex items-center gap-1 text-sm">
                    <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    {lead.taskCount}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-sm text-emerald-600">
                    {lead.completedTaskCount}
                  </span>
                </div>
                <div className="text-center">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {timeAgo(lead.lastActivityAt)}
                  </span>
                </div>
                <div className="text-right">
                  <ScoreBadge score={lead.score} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
