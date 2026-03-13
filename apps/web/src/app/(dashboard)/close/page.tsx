"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Plus,
  RefreshCw,
  Download,
  CheckCircle2,
  Clock,
  Send,
  XCircle,
  FileCheck,
  AlertCircle,
  Handshake,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";

type CloseTab = "contracts" | "handoff";

// ─── Contract types ───────────────────────────────────
interface Contract {
  id: string;
  title: string;
  contractType: string;
  status: string;
  recordId: string | null;
  approvalRequestId: string | null;
  createdAt: string;
  sentAt: string | null;
  signedAt: string | null;
  approvedAt: string | null;
}

interface Template {
  id: string;
  name: string;
  contractType: string;
  description: string | null;
}

const STATUS_CONFIG: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; label: string; className: string }
> = {
  draft: { icon: FileText, label: "Draft", className: "bg-muted text-muted-foreground" },
  pending_approval: { icon: Clock, label: "Pending Approval", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  approved: { icon: CheckCircle2, label: "Approved", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  sent: { icon: Send, label: "Sent", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  signed: { icon: FileCheck, label: "Signed", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  rejected: { icon: XCircle, label: "Rejected", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  expired: { icon: AlertCircle, label: "Expired", className: "bg-muted text-muted-foreground" },
  cancelled: { icon: XCircle, label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

function ContractStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

// ─── Handoff types ────────────────────────────────────
interface HandoffBrief {
  id: string;
  title: string;
  content: string | null;
  status: string;
  recordId: string | null;
  createdAt: string;
  updatedAt: string;
  structuredContent: Record<string, unknown> | null;
}

function BriefCard({ brief, onDeliver }: { brief: HandoffBrief; onDeliver: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [showWebhook, setShowWebhook] = useState(false);

  const structured = brief.structuredContent as {
    dealName?: string;
    companyName?: string;
    dealValue?: number;
    repName?: string;
  } | null;

  return (
    <Card>
      <div className="flex items-start gap-3 p-4">
        <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-2 shrink-0">
          <Handshake className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{brief.title}</p>
          {structured && (
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
              {structured.companyName && <span>{structured.companyName}</span>}
              {structured.dealValue && (
                <span className="font-medium text-foreground">
                  ${Number(structured.dealValue).toLocaleString()}
                </span>
              )}
              {structured.repName && <span>AE: {structured.repName}</span>}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Generated {new Date(brief.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            {brief.recordId && (
              <>
                {" · "}
                <Link href={`/objects/deals/${brief.recordId}`} className="hover:underline text-primary">
                  View deal
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setExpanded(!expanded)}>
            <Eye className="h-3.5 w-3.5 mr-1" />
            Preview
            {expanded ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
          </Button>
          <a
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(brief.content ?? "")}`}
            download={`handoff-brief-${brief.id}.md`}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            <Download className="h-3 w-3" />
            Export
          </a>
          <Button variant="outline" size="sm" className="h-7" onClick={() => setShowWebhook(!showWebhook)}>
            <Send className="h-3.5 w-3.5 mr-1" />
            Deliver
          </Button>
        </div>
      </div>

      {showWebhook && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <p className="text-xs text-muted-foreground mb-2">Deliver this handoff brief to an external CS tool via webhook.</p>
          <div className="flex gap-2">
            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-cs-tool.com/webhooks/handoff"
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button size="sm" onClick={() => { onDeliver(brief.id); setShowWebhook(false); }} disabled={!webhookUrl.trim()}>
              Send
            </Button>
          </div>
        </div>
      )}

      {expanded && brief.content && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <div className="rounded-md bg-muted/50 p-4 max-h-96 overflow-y-auto">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
              {brief.content}
            </pre>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Create Contract Modal ────────────────────────────
function CreateContractModal({
  templates,
  onSave,
  onClose,
}: {
  templates: Template[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [contractType, setContractType] = useState("custom");
  const [routeToApproval, setRouteToApproval] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), templateId: templateId || undefined, contractType, routeToApproval });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Generate Contract</CardTitle>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">×</button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. SOW for Acme Corp Q1 2025"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          {templates.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Template</label>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">— No template —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          {!templateId && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Contract type</label>
              <select value={contractType} onChange={(e) => setContractType(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="sow">Statement of Work (SOW)</option>
                <option value="nda">Non-Disclosure Agreement (NDA)</option>
                <option value="msa">Master Service Agreement (MSA)</option>
                <option value="proposal">Proposal</option>
                <option value="order_form">Order Form</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="routeToApproval" checked={routeToApproval} onChange={(e) => setRouteToApproval(e.target.checked)} className="rounded" />
            <label htmlFor="routeToApproval" className="text-sm cursor-pointer">Route to approval before sending</label>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !title.trim()}>
              {saving && <RefreshCw className="h-4 w-4 animate-spin mr-1" />}
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────

export default function ClosePage() {
  const [tab, setTab] = useState<CloseTab>("contracts");

  // Contract state
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contractsLoading, setContractsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Handoff state
  const [briefs, setBriefs] = useState<HandoffBrief[]>([]);
  const [briefsLoading, setBriefsLoading] = useState(false);

  const loadContracts = useCallback(async () => {
    setContractsLoading(true);
    try {
      const [contractsRes, templatesRes] = await Promise.all([
        fetch("/api/v1/contracts"),
        fetch("/api/v1/contracts/templates?seed=true"),
      ]);
      if (contractsRes.ok) setContracts((await contractsRes.json()).data ?? []);
      if (templatesRes.ok) setTemplates((await templatesRes.json()).data ?? []);
    } finally {
      setContractsLoading(false);
    }
  }, []);

  const loadBriefs = useCallback(async () => {
    setBriefsLoading(true);
    try {
      const res = await fetch("/api/v1/close-flow/handoff");
      if (res.ok) setBriefs((await res.json()).data ?? []);
    } finally {
      setBriefsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  useEffect(() => {
    if (tab === "handoff") loadBriefs();
  }, [tab, loadBriefs]);

  async function handleCreate(data: Record<string, unknown>) {
    await fetch("/api/v1/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await loadContracts();
  }

  async function handleStatusUpdate(contractId: string, status: string) {
    await fetch(`/api/v1/contracts/${contractId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadContracts();
  }

  async function handleDeliver(assetId: string) {
    // In the future, a proper modal — for now toast
    toast("Webhook delivery is configured in Settings → Webhooks");
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileCheck className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold">Close</h1>
            <p className="text-sm text-muted-foreground">
              Contracts, SOWs, and customer handoff briefs
            </p>
          </div>
        </div>
        {tab === "contracts" && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New contract
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setTab("contracts")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            tab === "contracts"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Contracts
        </button>
        <button
          onClick={() => setTab("handoff")}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
            tab === "handoff"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Handoff
        </button>
      </div>

      {/* Contracts tab */}
      {tab === "contracts" && (
        contractsLoading && contracts.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Loading contracts...
          </div>
        ) : contracts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No contracts yet</p>
              <p className="text-xs mt-1">Generate your first contract from a deal</p>
              <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Generate contract
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {contracts.map((contract) => (
              <Card key={contract.id}>
                <div className="flex items-start gap-3 p-4">
                  <FileText className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{contract.title}</p>
                      <ContractStatusBadge status={contract.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="capitalize">{contract.contractType.replace("_", " ")}</span>
                      <span>Created {new Date(contract.createdAt).toLocaleDateString()}</span>
                      {contract.sentAt && <span>Sent {new Date(contract.sentAt).toLocaleDateString()}</span>}
                      {contract.signedAt && <span className="text-emerald-600 dark:text-emerald-400 font-medium">Signed {new Date(contract.signedAt).toLocaleDateString()}</span>}
                      {contract.recordId && (
                        <Link href={`/objects/deals/${contract.recordId}`} className="hover:underline text-primary">View deal</Link>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {contract.status === "approved" && (
                      <Button variant="outline" size="sm" className="h-7" onClick={() => handleStatusUpdate(contract.id, "sent")}>
                        <Send className="h-3.5 w-3.5 mr-1" />
                        Mark sent
                      </Button>
                    )}
                    {contract.status === "sent" && (
                      <Button variant="outline" size="sm"
                        className="h-7 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400"
                        onClick={() => handleStatusUpdate(contract.id, "signed")}>
                        <FileCheck className="h-3.5 w-3.5 mr-1" />
                        Mark signed
                      </Button>
                    )}
                    <a href={`/api/v1/contracts/${contract.id}/download`} download
                      className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
                      <Download className="h-3 w-3" />
                      Download
                    </a>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {/* Handoff tab */}
      {tab === "handoff" && (
        briefsLoading && briefs.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Loading handoff briefs...
          </div>
        ) : briefs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Handshake className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No handoff briefs yet</p>
              <p className="text-xs mt-1">Briefs are automatically generated when a deal is marked closed-won</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {briefs.map((brief) => (
              <BriefCard key={brief.id} brief={brief} onDeliver={handleDeliver} />
            ))}
          </div>
        )
      )}

      {showCreate && (
        <CreateContractModal templates={templates} onSave={handleCreate} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
