"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Handshake,
  RefreshCw,
  Download,
  Send,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function BriefCard({
  brief,
  onDeliver,
}: {
  brief: HandoffBrief;
  onDeliver: (id: string) => void;
}) {
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
            Generated {formatDate(brief.createdAt)}
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
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => setExpanded(!expanded)}
          >
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
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => setShowWebhook(!showWebhook)}
          >
            <Send className="h-3.5 w-3.5 mr-1" />
            Deliver
          </Button>
        </div>
      </div>

      {showWebhook && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <p className="text-xs text-muted-foreground mb-2">
            Deliver this handoff brief to an external CS tool via webhook.
          </p>
          <div className="flex gap-2">
            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-cs-tool.com/webhooks/handoff"
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              size="sm"
              onClick={() => {
                onDeliver(brief.id);
                setShowWebhook(false);
              }}
              disabled={!webhookUrl.trim()}
            >
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

export default function HandoffPage() {
  const [briefs, setBriefs] = useState<HandoffBrief[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBriefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/close-flow/handoff");
      if (res.ok) setBriefs((await res.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBriefs();
  }, [loadBriefs]);

  async function handleDeliver(assetId: string) {
    // Would prompt for webhook URL in real implementation
    const url = prompt("Enter the webhook URL to deliver this brief:");
    if (!url) return;

    await fetch(`/api/v1/close-flow/handoff/${assetId}/deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl: url }),
    });

    await loadBriefs();
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Handshake className="h-5 w-5 text-emerald-500" />
            <h1 className="text-2xl font-semibold">Handoff Briefs</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Customer handoff briefs generated when deals close
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadBriefs} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {loading && briefs.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          Loading handoff briefs...
        </div>
      ) : briefs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Handshake className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No handoff briefs yet</p>
            <p className="text-xs mt-1">
              Briefs are automatically generated when a deal is marked closed-won
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {briefs.map((brief) => (
            <BriefCard key={brief.id} brief={brief} onDeliver={handleDeliver} />
          ))}
        </div>
      )}
    </div>
  );
}
