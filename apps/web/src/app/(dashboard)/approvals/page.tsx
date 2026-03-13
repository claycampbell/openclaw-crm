"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ClipboardCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Plus,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface ApprovalRequest {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  requestedBy: string | null;
  resolvedBy: string | null;
  resolverNote: string | null;
  expiresAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  recordId: string | null;
  context: Record<string, unknown>;
  rule: {
    id: string;
    name: string;
    triggerType: string;
    approverIds: string[];
  } | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: ApprovalRequest["status"] }) {
  const configs = {
    pending: { icon: Clock, label: "Pending", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    approved: { icon: CheckCircle2, label: "Approved", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    rejected: { icon: XCircle, label: "Rejected", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    expired: { icon: AlertCircle, label: "Expired", className: "bg-muted text-muted-foreground" },
  };
  const config = configs[status];
  const Icon = config.icon;

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function RequestCard({
  request,
  onApprove,
  onReject,
  isAdmin,
}: {
  request: ApprovalRequest;
  onApprove: (id: string, note?: string) => Promise<void>;
  onReject: (id: string, note?: string) => Promise<void>;
  isAdmin: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);

  const isApprover = isAdmin || (request.rule?.approverIds.includes("self") ?? false);
  const canAct = request.status === "pending" && isApprover;

  async function handle(action: "approve" | "reject") {
    setActing(true);
    try {
      if (action === "approve") await onApprove(request.id, note || undefined);
      else await onReject(request.id, note || undefined);
    } finally {
      setActing(false);
    }
  }

  return (
    <Card className={cn(request.status === "pending" && "border-amber-200/50 bg-amber-50/10 dark:border-amber-900/20")}>
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-sm">{request.title}</h3>
            <StatusBadge status={request.status} />
          </div>

          {request.description && (
            <p className="text-xs text-muted-foreground mt-1">{request.description}</p>
          )}

          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span>Created {formatDate(request.createdAt)}</span>
            {request.expiresAt && request.status === "pending" && (
              <span className="text-amber-600 dark:text-amber-400">
                Expires {formatDate(request.expiresAt)}
              </span>
            )}
            {request.resolvedAt && (
              <span>Resolved {formatDate(request.resolvedAt)}</span>
            )}
            {request.recordId && (
              <Link
                href={`/objects/deals/${request.recordId}`}
                className="hover:underline text-primary"
              >
                View deal
              </Link>
            )}
          </div>

          {request.resolverNote && (
            <p className="text-xs text-muted-foreground mt-1.5 italic">
              Note: {request.resolverNote}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canAct && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-900/50 dark:hover:bg-red-950/20 h-7"
                onClick={() => {
                  if (!expanded) setExpanded(true);
                }}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => handle("approve")}
                disabled={acting}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Approve
              </Button>
            </>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          {/* Context data */}
          {Object.keys(request.context).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Context</p>
              <div className="rounded-md bg-muted/50 p-2.5 text-xs font-mono text-muted-foreground overflow-x-auto">
                <pre>{JSON.stringify(request.context, null, 2)}</pre>
              </div>
            </div>
          )}

          {canAct && (
            <div className="space-y-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note (optional)..."
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400"
                  onClick={() => handle("reject")}
                  disabled={acting}
                >
                  {acting ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : <XCircle className="h-3.5 w-3.5 mr-1" />}
                  Reject
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => handle("approve")}
                  disabled={acting}
                >
                  {acting ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                  Approve
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [isAdmin, setIsAdmin] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const statusParam = filter === "pending" ? "?status=pending" : "";
      const res = await fetch(`/api/v1/approvals/requests${statusParam}`);
      if (res.ok) {
        const json = await res.json();
        setRequests(json.data ?? []);
      }

      // Check if admin
      const workspaceRes = await fetch("/api/v1/workspaces");
      if (workspaceRes.ok) {
        const wsData = await workspaceRes.json();
        const active = wsData.data?.find?.((ws: { id: string; role: string }) => {
          const cookieId = document.cookie
            .split("; ")
            .find((c) => c.startsWith("active-workspace-id="))
            ?.split("=")[1];
          return ws.id === cookieId;
        });
        if (active?.role === "admin") setIsAdmin(true);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function handleApprove(id: string, note?: string) {
    const res = await fetch(`/api/v1/approvals/requests/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (res.ok) { toast.success("Approved"); await loadRequests(); }
    else toast.error("Failed to approve");
  }

  async function handleReject(id: string, note?: string) {
    const res = await fetch(`/api/v1/approvals/requests/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (res.ok) { toast.success("Rejected"); await loadRequests(); }
    else toast.error("Failed to reject");
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-amber-500" />
            <h1 className="text-2xl font-semibold">Approvals</h1>
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-500 text-white text-xs px-2 py-0.5 font-medium">
                {pendingCount}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review and action approval requests for your deals
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link href="/settings/approvals">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-1" />
                Manage Rules
              </Button>
            </Link>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={loadRequests}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(["pending", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
              filter === f
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {f === "pending" ? "Pending" : "All Requests"}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && requests.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          Loading approvals...
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ClipboardCheck className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {filter === "pending" ? "No pending approvals" : "No approval requests"}
            </p>
            <p className="text-xs mt-1">
              {filter === "pending"
                ? "Everything is up to date"
                : "Approval requests will appear here when deals trigger approval rules"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onApprove={handleApprove}
              onReject={handleReject}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}
