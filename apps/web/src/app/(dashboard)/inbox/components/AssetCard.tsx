"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { GeneratedAsset, AssetType } from "@/db/schema/documents";

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  opportunity_brief: "Opportunity Brief",
  proposal: "Proposal",
  deck: "Presentation Deck",
  meeting_prep: "Meeting Prep",
  followup: "Follow-Up Draft",
  battlecard: "Battlecard",
  sequence_step: "Sequence Step",
};

const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  opportunity_brief: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  proposal: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  deck: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  meeting_prep: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  followup: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  battlecard: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  sequence_step: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

interface AssetCardProps {
  asset: GeneratedAsset;
  recordName?: string;
  onApproved: (assetId: string) => void;
  onRejected: (assetId: string) => void;
}

export function AssetCard({ asset, recordName, onApproved, onRejected }: AssetCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<"approve" | "reject" | null>(null);

  const preview = asset.contentMd
    ? asset.contentMd.substring(0, 200) + (asset.contentMd.length > 200 ? "..." : "")
    : "(No preview available)";

  const typeLabel = ASSET_TYPE_LABELS[asset.assetType as AssetType] ?? asset.assetType;
  const typeColor = ASSET_TYPE_COLORS[asset.assetType as AssetType] ?? "";

  const generatedAt = new Date(asset.generatedAt);
  const timeAgo = formatTimeAgo(generatedAt);

  async function handleApprove() {
    setActionLoading("approve");
    try {
      const res = await fetch(`/api/v1/assets/${asset.id}/approve`, { method: "POST" });
      if (res.ok) {
        setDialogOpen(false);
        onApproved(asset.id);
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject() {
    setActionLoading("reject");
    try {
      const res = await fetch(`/api/v1/assets/${asset.id}/reject`, { method: "POST" });
      if (res.ok) {
        setDialogOpen(false);
        onRejected(asset.id);
      }
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <>
      <Card className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => setDialogOpen(true)}>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeColor}`}>
                {typeLabel}
              </span>
              {recordName && (
                <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
                  {recordName}
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{timeAgo}</span>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-sm text-muted-foreground line-clamp-3">{preview}</p>
          <div className="flex items-center gap-2 mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setDialogOpen(true);
              }}
            >
              Review
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeColor}`}>
                {typeLabel}
              </span>
              {recordName && <span>{recordName}</span>}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
              <span>Generated {timeAgo}</span>
              {asset.modelUsed && (
                <>
                  <span>·</span>
                  <span>{asset.modelUsed}</span>
                </>
              )}
            </div>

            <Separator className="mb-4" />

            {/* Full content */}
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
                {asset.contentMd || "(No content available)"}
              </pre>
            </div>

            <Separator className="my-4" />

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleApprove}
                disabled={actionLoading !== null}
                className="flex-1 sm:flex-none"
              >
                {actionLoading === "approve" ? "Approving..." : "Approve"}
              </Button>
              <Button
                variant="outline"
                onClick={handleReject}
                disabled={actionLoading !== null}
                className="flex-1 sm:flex-none"
              >
                {actionLoading === "reject" ? "Rejecting..." : "Reject"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
