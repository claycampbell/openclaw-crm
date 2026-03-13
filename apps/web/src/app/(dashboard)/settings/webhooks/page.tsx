"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Webhook,
  Pencil,
  Trash2,
  Globe,
  CheckCircle2,
  XCircle,
  Copy,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────

const EVENT_OPTIONS = [
  { value: "record.created", label: "Record created" },
  { value: "record.updated", label: "Record updated" },
  { value: "record.deleted", label: "Record deleted" },
  { value: "deal.stage_changed", label: "Deal stage changed" },
  { value: "note.created", label: "Note created" },
  { value: "task.created", label: "Task created" },
  { value: "task.completed", label: "Task completed" },
];

// ─── Types ────────────────────────────────────────────────────────────

interface WebhookItem {
  id: string;
  name: string;
  url: string;
  events: string;
  enabled: boolean;
  hasSecret: boolean;
  failureCount: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  createdAt: string;
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function WebhooksSettingsPage() {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookItem | null>(null);
  const { dialogProps, confirm } = useConfirmDialog();

  // Form state
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/webhooks");
      if (res.ok) {
        const data = await res.json();
        setWebhooks(data.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const resetForm = () => {
    setFormName("");
    setFormUrl("");
    setFormSecret("");
    setFormEvents([]);
    setEditingWebhook(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (wh: WebhookItem) => {
    setEditingWebhook(wh);
    setFormName(wh.name);
    setFormUrl(wh.url);
    setFormSecret("");
    setFormEvents(wh.events.split(",").filter(Boolean));
    setDialogOpen(true);
  };

  const toggleEvent = (event: string) => {
    setFormEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleSave = async () => {
    if (!formName.trim() || !formUrl.trim() || formEvents.length === 0) {
      toast.error("Please fill in name, URL, and select at least one event");
      return;
    }

    try {
      new URL(formUrl);
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: formName.trim(),
        url: formUrl.trim(),
        events: formEvents,
      };
      if (formSecret.trim()) {
        body.secret = formSecret.trim();
      }

      if (editingWebhook) {
        const res = await fetch(`/api/v1/webhooks/${editingWebhook.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          toast.success("Webhook updated");
          setDialogOpen(false);
          fetchWebhooks();
        } else {
          toast.error("Failed to update webhook");
        }
      } else {
        const res = await fetch("/api/v1/webhooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          toast.success("Webhook created");
          setDialogOpen(false);
          fetchWebhooks();
        } else {
          toast.error("Failed to create webhook");
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (wh: WebhookItem) => {
    const newEnabled = !wh.enabled;
    setWebhooks((prev) =>
      prev.map((w) => (w.id === wh.id ? { ...w, enabled: newEnabled } : w))
    );
    const res = await fetch(`/api/v1/webhooks/${wh.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: newEnabled }),
    });
    if (res.ok) {
      toast.success(newEnabled ? "Webhook enabled" : "Webhook disabled");
    } else {
      setWebhooks((prev) =>
        prev.map((w) => (w.id === wh.id ? { ...w, enabled: !newEnabled } : w))
      );
      toast.error("Failed to update webhook");
    }
  };

  const handleDelete = async (wh: WebhookItem) => {
    const ok = await confirm({
      title: "Delete webhook",
      description: `Are you sure you want to delete "${wh.name}"? This action cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await fetch(`/api/v1/webhooks/${wh.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Webhook deleted");
      setWebhooks((prev) => prev.filter((w) => w.id !== wh.id));
    } else {
      toast.error("Failed to delete webhook");
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copied");
  };

  const handleTest = async (wh: WebhookItem) => {
    toast.info(`Sending test ping to ${wh.name}...`);
    try {
      const res = await fetch(`/api/v1/webhooks/${wh.id}/test`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        const d = result.data;
        if (d.success) {
          toast.success(`Test succeeded — HTTP ${d.status} in ${d.responseTimeMs}ms`);
        } else {
          toast.error(`Test failed — ${d.statusText} (${d.responseTimeMs}ms)`);
        }
      } else {
        toast.error("Failed to send test");
      }
    } catch {
      toast.error("Failed to send test");
    }
  };

  if (loading) return <ListPageSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Outbound webhooks</h2>
          <p className="text-sm text-muted-foreground">
            Send CRM events to external URLs via HTTP POST with optional HMAC-SHA256 signing.
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add webhook
        </Button>
      </div>

      {webhooks.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="No webhooks configured"
          description="Send real-time CRM events to external services like Zapier, Make, or your own API."
          actionLabel="Add webhook"
          onAction={openCreate}
          compact
        />
      ) : (
        <div className="grid gap-3">
          {webhooks.map((wh) => (
            <Card key={wh.id} className={!wh.enabled ? "opacity-60" : undefined}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex items-center justify-center h-9 w-9 rounded-md bg-primary/10 shrink-0">
                  <Globe className="h-4 w-4 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{wh.name}</p>
                    {wh.failureCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-destructive">
                        <XCircle className="h-3 w-3" />
                        {wh.failureCount} failures
                      </span>
                    )}
                    {wh.lastSuccessAt && wh.failureCount === 0 && (
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />
                        Healthy
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="truncate max-w-[400px]">{wh.url}</span>
                    <button
                      onClick={() => copyUrl(wh.url)}
                      className="hover:text-foreground transition-colors"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {wh.events.split(",").join(", ")}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={wh.enabled} onCheckedChange={() => handleToggle(wh)} />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleTest(wh)}
                    title="Send test ping"
                  >
                    <Zap className="h-4 w-4 text-amber-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(wh)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(wh)}>
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
              {editingWebhook ? "Edit webhook" : "New webhook"}
            </DialogTitle>
            <DialogDescription>
              Configure an endpoint to receive CRM event notifications.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="wh-name">Name</Label>
              <Input
                id="wh-name"
                placeholder="e.g. Zapier integration"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wh-url">Endpoint URL</Label>
              <Input
                id="wh-url"
                type="url"
                placeholder="https://hooks.example.com/webhook"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wh-secret">
                Signing secret <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="wh-secret"
                type="password"
                placeholder={editingWebhook?.hasSecret ? "••••••••" : "Leave blank to skip signing"}
                value={formSecret}
                onChange={(e) => setFormSecret(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                HMAC-SHA256 signature sent in X-Webhook-Signature header.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Events</Label>
              <div className="grid grid-cols-2 gap-2">
                {EVENT_OPTIONS.map((ev) => (
                  <label
                    key={ev.value}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={formEvents.includes(ev.value)}
                      onCheckedChange={() => toggleEvent(ev.value)}
                    />
                    {ev.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingWebhook ? "Save changes" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
