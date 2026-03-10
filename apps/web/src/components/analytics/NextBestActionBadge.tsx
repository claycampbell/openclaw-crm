"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";

// ─── Types ───────────────────────────────────────────────────────────

interface NextBestActionData {
  recordId: string;
  stage: string;
  action: string;
  reason: string | null;
  urgency: "high" | "medium" | "low";
  computedAt: string;
}

interface NextBestActionBadgeProps {
  recordId: string;
}

// ─── Urgency indicator ────────────────────────────────────────────────

function UrgencyDot({ urgency }: { urgency: "high" | "medium" | "low" }) {
  const colorMap = {
    high: "bg-red-500",
    medium: "bg-yellow-500",
    low: "bg-muted-foreground/40",
  };

  return (
    <span
      className={`inline-block h-2 w-2 rounded-full shrink-0 ${colorMap[urgency]}`}
      title={`${urgency} urgency`}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────

export function NextBestActionBadge({ recordId }: NextBestActionBadgeProps) {
  const [nba, setNba] = useState<NextBestActionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!recordId) {
      setLoading(false);
      return;
    }

    fetch(`/api/v1/analytics/next-best-action?recordId=${encodeURIComponent(recordId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("NBA fetch failed");
        return res.json();
      })
      .then((json) => {
        if (json.data) setNba(json.data);
      })
      .catch(() => {
        // Fail silently — NBA is ambient, not critical
      })
      .finally(() => setLoading(false));
  }, [recordId]);

  // Loading skeleton
  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground animate-pulse">Thinking...</p>
        </CardContent>
      </Card>
    );
  }

  // If failed or no data, render nothing
  if (!nba) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="py-3 px-4 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Next best action
          </p>
          <UrgencyDot urgency={nba.urgency} />
        </div>

        <p className="text-sm font-semibold leading-snug">{nba.action}</p>

        {nba.reason && (
          <p className="text-xs text-muted-foreground leading-relaxed">{nba.reason}</p>
        )}
      </CardContent>
    </Card>
  );
}
