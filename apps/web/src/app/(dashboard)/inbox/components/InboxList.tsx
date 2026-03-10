"use client";

import { useState } from "react";
import { AssetCard } from "./AssetCard";
import type { GeneratedAsset } from "@/db/schema/documents";

interface InboxListProps {
  initialAssets: GeneratedAsset[];
  recordNames: Record<string, string>;
}

export function InboxList({ initialAssets, recordNames }: InboxListProps) {
  const [assets, setAssets] = useState(initialAssets);

  function handleApproved(assetId: string) {
    setAssets((prev) => prev.filter((a) => a.id !== assetId));
  }

  function handleRejected(assetId: string) {
    setAssets((prev) => prev.filter((a) => a.id !== assetId));
  }

  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-4xl mb-3">✓</div>
        <p className="text-lg font-medium text-foreground">All caught up</p>
        <p className="text-sm text-muted-foreground mt-1">
          No drafts waiting for review. New AI-generated assets will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          recordName={asset.recordId ? recordNames[asset.recordId] : undefined}
          onApproved={handleApproved}
          onRejected={handleRejected}
        />
      ))}
    </div>
  );
}
