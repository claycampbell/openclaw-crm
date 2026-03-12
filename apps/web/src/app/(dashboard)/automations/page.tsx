"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { ListPageSkeleton } from "@/components/ui/page-skeleton";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Zap, Pencil, Trash2, Play, Pause } from "lucide-react";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────

const TRIGGER_TYPES = [
  { value: "record_created", label: "Record created" },
  { value: "stage_changed", label: "Deal stage changed" },
  { value: "note_added", label: "Note added" },
  { value: "meeting_ended", label: "Meeting ended" },
  { value: "email_received", label: "Email received" },
  { value: "email_replied", label: "Email reply received" },
];

const ACTION_TYPES = [
  { value: "enqueue_ai_generate", label: "Generate AI document" },
  { value: "enqueue_email_send", label: "Send email" },
  { value: "create_task", label: "Create task" },
  { value: "create_note", label: "Create note" },
  { value: "enqueue_email_sync", label: "Trigger email sync" },
  { value: "enqueue_calendar_sync", label: "Trigger calendar sync" },
];

const AI_DOCUMENT_TYPES = [
  { value: "opportunity_brief", label: "Opportunity brief" },
  { value: "proposal", label: "Proposal" },
  { value: "deck", label: "Presentation deck" },
  { value: "followup", label: "Follow-up email" },
  { value: "battlecard", label: "Battlecard" },
  { value: "meeting_prep", label: "Meeting prep" },
];

// ─── Types ────────────────────────────────────────────────────────────

interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: string;
  conditions: unknown[];
  actionType: string;
  actionPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const { dialogProps, confirm } = useConfirmDialog();

  // Form state
  const [formName, setFormName] = useState("");
  const [formTrigger, setFormTrigger] = useState("");
  const [formAction, setFormAction] = useState("");
  const [formDocType, setFormDocType] = useState("");
  const [formTaskTitle, setFormTaskTitle] = useState("");
  const [formNoteText, setFormNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/automations");
      if (res.ok) {
        const data = await res.json();
        setRules(data.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const resetForm = () => {
    setFormName("");
    setFormTrigger("");
    setFormAction("");
    setFormDocType("");
    setFormTaskTitle("");
    setFormNoteText("");
    setEditingRule(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (rule: AutomationRule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormTrigger(rule.triggerType);
    setFormAction(rule.actionType);
    const payload = rule.actionPayload ?? {};
    setFormDocType((payload.documentType as string) ?? "");
    setFormTaskTitle((payload.taskTitle as string) ?? "");
    setFormNoteText((payload.noteText as string) ?? "");
    setDialogOpen(true);
  };

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {};
    if (formAction === "enqueue_ai_generate" && formDocType) {
      payload.documentType = formDocType;
      payload.contextTier = "full";
    }
    if (formAction === "create_task" && formTaskTitle) {
      payload.taskTitle = formTaskTitle;
    }
    if (formAction === "create_note" && formNoteText) {
      payload.noteText = formNoteText;
    }
    return payload;
  };

  const handleSave = async () => {
    if (!formName.trim() || !formTrigger || !formAction) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: formName.trim(),
        triggerType: formTrigger,
        actionType: formAction,
        actionPayload: buildPayload(),
      };

      if (editingRule) {
        const res = await fetch(`/api/v1/automations/${editingRule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          toast.success("Automation updated");
          setDialogOpen(false);
          fetchRules();
        } else {
          toast.error("Failed to update automation");
        }
      } else {
        const res = await fetch("/api/v1/automations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          toast.success("Automation created");
          setDialogOpen(false);
          fetchRules();
        } else {
          toast.error("Failed to create automation");
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule: AutomationRule) => {
    const newEnabled = !rule.enabled;
    // Optimistic update
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, enabled: newEnabled } : r))
    );
    const res = await fetch(`/api/v1/automations/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: newEnabled }),
    });
    if (res.ok) {
      toast.success(newEnabled ? "Automation enabled" : "Automation paused");
    } else {
      // Revert
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: !newEnabled } : r))
      );
      toast.error("Failed to update automation");
    }
  };

  const handleDelete = async (rule: AutomationRule) => {
    const ok = await confirm({
      title: "Delete automation",
      description: `Are you sure you want to delete "${rule.name}"? This action cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await fetch(`/api/v1/automations/${rule.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Automation deleted");
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } else {
      toast.error("Failed to delete automation");
    }
  };

  const getTriggerLabel = (type: string) =>
    TRIGGER_TYPES.find((t) => t.value === type)?.label ?? type;

  const getActionLabel = (type: string) =>
    ACTION_TYPES.find((a) => a.value === type)?.label ?? type;

  if (loading) return <ListPageSkeleton />;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automations</h1>
          <p className="text-sm text-muted-foreground">
            Create rules that automatically trigger actions when events occur.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New automation
        </Button>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No automations yet"
          description="Set up rules to automatically generate documents, create tasks, or send emails when things happen in your CRM."
          actionLabel="Create automation"
          onAction={openCreate}
        />
      ) : (
        <div className="grid gap-3">
          {rules.map((rule) => (
            <Card key={rule.id} className={!rule.enabled ? "opacity-60" : undefined}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex items-center justify-center h-9 w-9 rounded-md bg-primary/10 shrink-0">
                  {rule.enabled ? (
                    <Play className="h-4 w-4 text-primary" />
                  ) : (
                    <Pause className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{rule.name}</p>
                  <p className="text-sm text-muted-foreground">
                    When <span className="font-medium text-foreground">{getTriggerLabel(rule.triggerType)}</span>
                    {" → "}
                    <span className="font-medium text-foreground">{getActionLabel(rule.actionType)}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={() => handleToggle(rule)}
                  />
                  <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(rule)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "Edit automation" : "New automation"}
            </DialogTitle>
            <DialogDescription>
              Define when this automation triggers and what action it performs.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                placeholder="e.g. Generate proposal on stage change"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>When this happens</Label>
              <Select value={formTrigger} onValueChange={setFormTrigger}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a trigger..." />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Do this</Label>
              <Select value={formAction} onValueChange={setFormAction}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an action..." />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action-specific fields */}
            {formAction === "enqueue_ai_generate" && (
              <div className="space-y-1.5">
                <Label>Document type</Label>
                <Select value={formDocType} onValueChange={setFormDocType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select document type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_DOCUMENT_TYPES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formAction === "create_task" && (
              <div className="space-y-1.5">
                <Label htmlFor="task-title">Task title</Label>
                <Input
                  id="task-title"
                  placeholder="e.g. Follow up with client"
                  value={formTaskTitle}
                  onChange={(e) => setFormTaskTitle(e.target.value)}
                />
              </div>
            )}

            {formAction === "create_note" && (
              <div className="space-y-1.5">
                <Label htmlFor="note-text">Note text</Label>
                <Input
                  id="note-text"
                  placeholder="e.g. Auto-generated note from automation"
                  value={formNoteText}
                  onChange={(e) => setFormNoteText(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingRule ? "Save changes" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
