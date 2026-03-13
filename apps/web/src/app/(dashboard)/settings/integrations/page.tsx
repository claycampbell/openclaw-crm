"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Mail,
  Calendar,
  Linkedin,
  Video,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "active" | "revoked" | "error" | "expired" | null;

interface ConnectionStatuses {
  gmail: Status;
  outlook: Status;
  google_calendar: Status;
  outlook_calendar: Status;
  zoom: Status;
  linkedin: Status;
}

interface IntegrationCard {
  key: keyof ConnectionStatuses;
  label: string;
  description: string;
  icon: React.ElementType;
  connectHref: string;
  disconnectEndpoint: string;
  note?: string;
}

const INTEGRATIONS: IntegrationCard[] = [
  {
    key: "gmail",
    label: "Gmail",
    description: "Sync emails to/from your Gmail account. Auto-log emails to deal contacts.",
    icon: Mail,
    connectHref: "/api/v1/integrations/gmail/connect",
    disconnectEndpoint: "/api/v1/integrations/gmail/disconnect",
    note: "Connecting Gmail also grants Google Calendar access.",
  },
  {
    key: "google_calendar",
    label: "Google Calendar",
    description: "Automatically log meetings with deal contacts to the activity timeline.",
    icon: Calendar,
    connectHref: "/api/v1/integrations/gmail/connect",
    disconnectEndpoint: "/api/v1/integrations/gmail/disconnect",
    note: "Shared Gmail credential — connect Gmail to enable this.",
  },
  {
    key: "outlook",
    label: "Outlook / O365",
    description: "Sync emails from your Microsoft 365 account. Auto-log emails to deal contacts.",
    icon: Mail,
    connectHref: "/api/v1/integrations/outlook/connect",
    disconnectEndpoint: "/api/v1/integrations/outlook/disconnect",
    note: "Connecting Outlook also grants Outlook Calendar access.",
  },
  {
    key: "outlook_calendar",
    label: "Outlook Calendar",
    description: "Automatically log Outlook Calendar meetings to the activity timeline.",
    icon: Calendar,
    connectHref: "/api/v1/integrations/outlook/connect",
    disconnectEndpoint: "/api/v1/integrations/outlook/disconnect",
    note: "Shared O365 credential — connect Outlook to enable this.",
  },
  {
    key: "linkedin",
    label: "LinkedIn Enrichment",
    description:
      "Automatically enrich new People records with LinkedIn title, company, and location via Proxycurl.",
    icon: Linkedin,
    connectHref: "#",
    disconnectEndpoint: "",
    note: "Requires PROXYCURL_API_KEY in workspace environment settings.",
  },
  {
    key: "zoom",
    label: "Zoom",
    description:
      "Receive Zoom call recording webhooks. Auto-transcribe and log calls to deal timelines.",
    icon: Video,
    connectHref: "/api/v1/integrations/zoom/connect",
    disconnectEndpoint: "/api/v1/integrations/zoom/disconnect",
    note: "Uses Server-to-Server OAuth — configure Zoom credentials in settings.",
  },
];

function StatusBadge({ status }: { status: Status }) {
  if (status === "active") {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-green-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Connected
      </span>
    );
  }
  if (status === "revoked" || status === "expired") {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-red-500">
        <XCircle className="h-3.5 w-3.5" />
        {status === "revoked" ? "Disconnected" : "Expired"}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-yellow-600">
        <AlertCircle className="h-3.5 w-3.5" />
        Error
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
      Not connected
    </span>
  );
}

export default function IntegrationsPage() {
  const [statuses, setStatuses] = useState<ConnectionStatuses | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const connectedParam = searchParams?.get("connected");
  const errorParam = searchParams?.get("error");

  useEffect(() => {
    fetch("/api/v1/integrations/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setStatuses(data.data);
      })
      .catch(() => {});
  }, []);

  async function handleDisconnect(integration: IntegrationCard) {
    if (!integration.disconnectEndpoint) return;
    setDisconnecting(integration.key);
    try {
      const res = await fetch(integration.disconnectEndpoint, { method: "POST" });
      if (!res.ok) { toast.error("Failed to disconnect"); return; }
      toast.success(`${integration.label} disconnected`);
      setStatuses((prev) =>
        prev ? { ...prev, [integration.key]: "revoked" } : prev
      );
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-2">Integrations</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Connect your email, calendar, and communication tools to automatically log activity
        in the CRM.
      </p>

      {connectedParam && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="inline h-4 w-4 mr-1 -mt-0.5" />
          {connectedParam} connected successfully.
        </div>
      )}

      {errorParam && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="inline h-4 w-4 mr-1 -mt-0.5" />
          Connection failed: {errorParam.replace(/_/g, " ")}. Please try again.
        </div>
      )}

      <div className="space-y-3">
        {INTEGRATIONS.map((integration) => {
          const status = statuses?.[integration.key] ?? null;
          const Icon = integration.icon;
          const isConnecting = disconnecting === integration.key;

          return (
            <div
              key={integration.key}
              className={cn(
                "rounded-lg border border-border p-4 flex items-start gap-4",
                status === "active" && "border-green-200 bg-green-50/30"
              )}
            >
              <div className="flex-shrink-0 rounded-md bg-muted p-2">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium">{integration.label}</span>
                  {!statuses ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  ) : (
                    <StatusBadge status={status} />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{integration.description}</p>
                {integration.note && (
                  <p className="text-xs text-muted-foreground/70 mt-1 italic">
                    {integration.note}
                  </p>
                )}
              </div>

              <div className="flex-shrink-0">
                {status === "active" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDisconnect(integration)}
                    disabled={isConnecting}
                  >
                    {isConnecting && (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    )}
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant={
                      status === "error" || status === "revoked" || status === "expired"
                        ? "destructive"
                        : "default"
                    }
                    size="sm"
                    asChild={integration.connectHref !== "#"}
                    disabled={integration.connectHref === "#"}
                  >
                    {integration.connectHref !== "#" ? (
                      <a href={integration.connectHref}>
                        {status === "error" || status === "revoked" || status === "expired"
                          ? "Reconnect"
                          : "Connect"}
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    ) : (
                      <span>Configure</span>
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
