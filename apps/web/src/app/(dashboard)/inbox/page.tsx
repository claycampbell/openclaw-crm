"use client";

import { useState, useEffect, useCallback } from "react";
import { InboxList } from "./components/InboxList";
import type { GeneratedAsset } from "@/db/schema/documents";
import {
  Loader2,
  Inbox,
  ClipboardCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Settings,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ─── Tab type ──────────────────────────────────────────
type InboxTab = "assets" | "approvals";

// ─── Approval types ────────────────────────────────────
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

function ApprovalStatusBadge({ status }: { status: ApprovalRequest["status"] }) {
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
            <ApprovalStatusBadge status={request.status} />
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
            {request.resolvedAt && <span>Resolved {formatDate(request.resolvedAt)}</span>}
            {request.recordId && (
              <Link href={`/objects/deals/${request.recordId}`} className="hover:underline text-primary">
                View deal
              </Link>
            )}
          </div>
          {request.resolverNote && (
            <p className="text-xs text-muted-foreground mt-1.5 italic">Note: {request.resolverNote}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canAct && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-900/50 dark:hover:bg-red-950/20 h-7"
                onClick={() => { if (!expanded) setExpanded(true); }}
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
          <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
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

// ─── Main page ─────────────────────────────────────────

export default function InboxPage() {
  const [tab, setTab] = useState<InboxTab>("assets");

  // Asset state
  const [assets, setAssets] = useState<GeneratedAsset[]>([]);
  const [recordNames, setRecordNames] = useState<Record<string, string>>({});
  const [assetsLoading, setAssetsLoading] = useState(true);

  // Approval state
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalFilter, setApprovalFilter] = useState<"pending" | "all">("pending");
  const [isAdmin, setIsAdmin] = useState(false);

  // ── Asset fetching ──
  const fetchAssets = useCallback(async () => {
    setAssetsLoading(true);
    try {
      const res = await fetch("/api/v1/assets?status=draft&limit=50");
      if (res.ok) {
        const data = await res.json();
        const fetchedAssets: GeneratedAsset[] = data.data ?? [];
        setAssets(fetchedAssets);

        const recordIds = [...new Set(fetchedAssets.map((a) => a.recordId).filter((id): id is string => id !== null))];
        if (recordIds.length > 0) {
          const names: Record<string, string> = {};
          await Promise.all(
            recordIds.map(async (rid) => {
              try {
                const rRes = await fetch(`/api/v1/records/${rid}`);
                if (rRes.ok) {
                  const rData = await rRes.json();
                  const values = rData.data?.values ?? {};
                  names[rid] = extractDisplayName(values) ?? `Record ${rid.slice(0, 8)}`;
                }
              } catch {
                names[rid] = `Record ${rid.slice(0, 8)}`;
              }
            })
          );
          setRecordNames(names);
        }
      }
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  // ── Approval fetching ──
  const loadApprovals = useCallback(async () => {
    setApprovalsLoading(true);
    try {
      const statusParam = approvalFilter === "pending" ? "?status=pending" : "";
      const res = await fetch(`/api/v1/approvals/requests${statusParam}`);
      if (res.ok) {
        const json = await res.json();
        setRequests(json.data ?? []);
      }
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
      setApprovalsLoading(false);
    }
  }, [approvalFilter]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  useEffect(() => {
    if (tab === "approvals") loadApprovals();
  }, [tab, loadApprovals]);

  async function handleApprove(id: string, note?: string) {
    const res = await fetch(`/api/v1/approvals/requests/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (res.ok) { toast.success("Approved"); await loadApprovals(); }
    else toast.error("Failed to approve");
  }

  async function handleReject(id: string, note?: string) {
    const res = await fetch(`/api/v1/approvals/requests/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (res.ok) { toast.success("Rejected"); await loadApprovals(); }
    else toast.error("Failed to reject");
  }

  const pendingApprovalCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Inbox className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold">Reviews</h1>
            <p className="text-sm text-muted-foreground">
              AI drafts and approval requests that need your attention
            </p>
          </div>
        </div>
        {tab === "approvals" && isAdmin && (
          <Link href="/settings/approvals">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-1" />
              Manage Rules
            </Button>
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setTab("assets")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2",
            tab === "assets"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          AI Drafts
          {assets.length > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {assets.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("approvals")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2",
            tab === "approvals"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Approvals
          {pendingApprovalCount > 0 && (
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              {pendingApprovalCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {tab === "assets" && (
        assetsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <InboxList initialAssets={assets} recordNames={recordNames} />
        )
      )}

      {tab === "approvals" && (
        <>
          {/* Sub-filter for approvals */}
          <div className="flex items-center gap-1">
            {(["pending", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setApprovalFilter(f)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-full transition-colors",
                  approvalFilter === f
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {f === "pending" ? "Pending" : "All"}
              </button>
            ))}
          </div>

          {approvalsLoading && requests.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Loading approvals...
            </div>
          ) : requests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ClipboardCheck className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">
                  {approvalFilter === "pending" ? "No pending approvals" : "No approval requests"}
                </p>
                <p className="text-xs mt-1">
                  {approvalFilter === "pending"
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
        </>
      )}
    </div>
  );
}

function extractDisplayName(values: Record<string, unknown>): string | null {
  const nameSlugs = ["name", "deal-name", "full-name", "company-name", "title", "first-name", "subject"];
  for (const slug of nameSlugs) {
    const val = values[slug];
    if (!val) continue;
    if (typeof val === "object" && val !== null) {
      const obj = val as Record<string, unknown>;
      if (typeof obj.fullName === "string") return obj.fullName.trim();
      if (typeof obj.firstName === "string") {
        const last = typeof obj.lastName === "string" ? ` ${obj.lastName}` : "";
        return `${obj.firstName}${last}`.trim();
      }
    }
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return null;
}
