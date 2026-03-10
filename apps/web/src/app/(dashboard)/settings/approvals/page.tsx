"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Trash2,
  Settings,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ApprovalRule {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  conditions: Record<string, unknown>;
  approverIds: string[];
  expiresAfterHours: number | null;
  isActive: string;
  createdAt: string;
}

interface WorkspaceMember {
  id: string;
  userId: string;
  name?: string;
  email?: string;
  role: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  discount_threshold: "Discount above threshold",
  deal_value_threshold: "Deal value above threshold",
  stage_change: "Deal stage changes to",
  contract_send: "Contract send",
  manual: "Manual trigger",
};

function RuleCard({
  rule,
  members,
  onDelete,
}: {
  rule: ApprovalRule;
  members: WorkspaceMember[];
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const approvers = members.filter((m) => rule.approverIds.includes(m.userId));

  return (
    <Card>
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm">{rule.name}</p>
          </div>
          {rule.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
              {TRIGGER_LABELS[rule.triggerType] ?? rule.triggerType}
            </span>
            {approvers.length > 0 && (
              <span>
                Approvers: {approvers.map((m) => m.name ?? m.email ?? m.userId).join(", ")}
              </span>
            )}
            {rule.expiresAfterHours != null && (
              <span>Expires after {rule.expiresAfterHours}h</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
            onClick={() => onDelete(rule.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Conditions</p>
          <div className="rounded-md bg-muted/50 p-2.5 text-xs font-mono text-muted-foreground">
            <pre>{JSON.stringify(rule.conditions, null, 2)}</pre>
          </div>
        </div>
      )}
    </Card>
  );
}

function CreateRuleDialog({
  members,
  onSave,
  onClose,
}: {
  members: WorkspaceMember[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("discount_threshold");
  const [conditionValue, setConditionValue] = useState("");
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);
  const [expiresHours, setExpiresHours] = useState("");
  const [saving, setSaving] = useState(false);

  function buildConditions(): Record<string, unknown> {
    switch (triggerType) {
      case "discount_threshold":
        return { threshold: Number(conditionValue) };
      case "deal_value_threshold":
        return { threshold: Number(conditionValue) };
      case "stage_change":
        return { stage: conditionValue };
      default:
        return {};
    }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        triggerType,
        conditions: buildConditions(),
        approverIds: selectedApprovers,
        expiresAfterHours: expiresHours ? Number(expiresHours) : undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Create Approval Rule</CardTitle>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              ×
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Rule Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Manager approval for discounts > 20%"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Trigger</label>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {Object.entries(TRIGGER_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {["discount_threshold", "deal_value_threshold", "stage_change"].includes(triggerType) && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {triggerType === "stage_change" ? "Stage Name" : "Threshold"}
              </label>
              <input
                value={conditionValue}
                onChange={(e) => setConditionValue(e.target.value)}
                placeholder={
                  triggerType === "discount_threshold" ? "e.g. 20 (percent)" :
                  triggerType === "deal_value_threshold" ? "e.g. 50000 (dollars)" :
                  "e.g. closed-won"
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Approvers</label>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {members.map((m) => (
                <label key={m.userId} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedApprovers.includes(m.userId)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedApprovers((prev) => [...prev, m.userId]);
                      } else {
                        setSelectedApprovers((prev) => prev.filter((id) => id !== m.userId));
                      }
                    }}
                    className="rounded"
                  />
                  {m.name ?? m.email ?? m.userId}
                  {m.role === "admin" && (
                    <span className="text-xs text-muted-foreground">(admin)</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Auto-expire after (hours)
            </label>
            <input
              type="number"
              value={expiresHours}
              onChange={(e) => setExpiresHours(e.target.value)}
              placeholder="Leave blank for no expiry"
              min="1"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : null}
              Create Rule
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ApprovalSettingsPage() {
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [rulesRes, membersRes] = await Promise.all([
        fetch("/api/v1/approvals/rules"),
        fetch("/api/v1/workspaces/members"),
      ]);
      if (rulesRes.ok) setRules((await rulesRes.json()).data ?? []);
      if (membersRes.ok) setMembers((await membersRes.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate(data: Record<string, unknown>) {
    await fetch("/api/v1/approvals/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await loadData();
  }

  async function handleDelete(ruleId: string) {
    if (!confirm("Deactivate this approval rule?")) return;
    await fetch(`/api/v1/approvals/rules/${ruleId}`, { method: "DELETE" });
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Approval Rules
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure when deals require approval before proceeding
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Rule
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          Loading...
        </div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Settings className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No approval rules configured</p>
            <p className="text-xs mt-1">
              Create rules to require approvals for discounts, high-value deals, or stage changes
            </p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create First Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              members={members}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateRuleDialog
          members={members}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
