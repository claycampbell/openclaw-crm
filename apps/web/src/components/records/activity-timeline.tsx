"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail,
  Calendar,
  Phone,
  StickyNote,
  CheckSquare,
  ArrowRight,
  Sparkles,
  UserPlus,
  Clock,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Legacy types (for backward compat with existing callers) ─────────────────

interface LegacyActivityItem {
  id: string;
  type: "created" | "note" | "task";
  title: string;
  description?: string;
  createdAt: string;
  createdBy?: string;
}

// ─── New unified timeline types ───────────────────────────────────────────────

type TimelineEventType =
  | "email_received"
  | "email_sent"
  | "email_opened"
  | "meeting"
  | "call"
  | "note"
  | "task"
  | "signal"
  | "created";

interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  description?: string | null;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ActivityTimelineProps {
  // Legacy mode: pass pre-fetched activities array
  activities?: LegacyActivityItem[];
  // New mode: pass recordId and let the component fetch from API
  recordId?: string;
  // Initial events (for SSR / pre-fetched data)
  initialEvents?: TimelineEvent[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityTimeline({
  activities,
  recordId,
  initialEvents,
}: ActivityTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents ?? []);
  const [loading, setLoading] = useState(!initialEvents && !!recordId);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const fetchPage = useCallback(
    async (nextCursor: string | null = null, append = false) => {
      if (!recordId) return;

      const params = new URLSearchParams();
      if (nextCursor) params.set("cursor", nextCursor);
      params.set("limit", "25");

      const res = await fetch(`/api/v1/timeline/${recordId}?${params}`);
      if (!res.ok) return;

      const json = await res.json() as {
        data?: { events: TimelineEvent[]; total: number; nextCursor: string | null };
      };
      const data = json.data;
      if (!data) return;

      setEvents((prev) => (append ? [...prev, ...data.events] : data.events));
      setTotal(data.total);
      setCursor(data.nextCursor);
      setHasMore(data.nextCursor !== null);
    },
    [recordId]
  );

  useEffect(() => {
    if (recordId && !initialEvents) {
      setLoading(true);
      fetchPage(null, false).finally(() => setLoading(false));
    }
  }, [recordId, initialEvents, fetchPage]);

  async function handleLoadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    await fetchPage(cursor, true).finally(() => setLoadingMore(false));
  }

  // ── Legacy mode ──────────────────────────────────────────────────────────────

  if (activities !== undefined) {
    if (activities.length === 0) {
      return (
        <div className="px-3 py-4 text-sm text-muted-foreground">
          No activity yet.
        </div>
      );
    }

    return (
      <div className="relative space-y-0">
        <div className="absolute left-[19px] top-3 bottom-3 w-px bg-border" />
        {activities.map((activity) => (
          <div key={activity.id} className="relative flex gap-3 px-3 py-2">
            <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background">
              <LegacyIcon type={activity.type} />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm">{activity.title}</p>
              {activity.description && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {activity.description}
                </p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatRelativeTime(activity.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── New unified mode ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="px-3 py-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="h-6 w-6 rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-1.5 pt-0.5">
              <div className="h-3 bg-muted rounded w-3/4" />
              <div className="h-2.5 bg-muted rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-muted-foreground">
        No activity yet.
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <div className="relative">
        <div className="absolute left-[19px] top-3 bottom-3 w-px bg-border" />

        {events.map((event) => (
          <div key={event.id} className="relative flex gap-3 px-3 py-2">
            <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background">
              <TimelineIcon type={event.type} />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-medium leading-snug">{event.title}</p>
              {event.description && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {event.description}
                </p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatRelativeTime(event.occurredAt)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="px-3 pt-1 pb-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <ChevronDown className="mr-1.5 h-3 w-3" />
            )}
            {loadingMore ? "Loading..." : `Load more (${total - events.length} remaining)`}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────

function TimelineIcon({ type }: { type: TimelineEventType }) {
  switch (type) {
    case "email_received":
    case "email_sent":
    case "email_opened":
      return <Mail className="h-3 w-3 text-blue-500" />;
    case "meeting":
      return <Calendar className="h-3 w-3 text-purple-500" />;
    case "call":
      return <Phone className="h-3 w-3 text-green-500" />;
    case "note":
      return <StickyNote className="h-3 w-3 text-yellow-500" />;
    case "task":
      return <CheckSquare className="h-3 w-3 text-orange-500" />;
    case "signal":
      return <ArrowRight className="h-3 w-3 text-gray-500" />;
    case "created":
      return <UserPlus className="h-3 w-3 text-green-500" />;
    default:
      return <Clock className="h-3 w-3 text-muted-foreground" />;
  }
}

function LegacyIcon({ type }: { type: LegacyActivityItem["type"] }) {
  switch (type) {
    case "created":
      return <UserPlus className="h-3 w-3 text-green-500" />;
    case "note":
      return <StickyNote className="h-3 w-3 text-blue-500" />;
    case "task":
      return <CheckSquare className="h-3 w-3 text-purple-500" />;
    default:
      return <Clock className="h-3 w-3 text-muted-foreground" />;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
