"use client";

import { useState, useEffect } from "react";
import { InboxList } from "./components/InboxList";
import type { GeneratedAsset } from "@/db/schema/documents";
import { Loader2, Inbox } from "lucide-react";

export default function InboxPage() {
  const [assets, setAssets] = useState<GeneratedAsset[]>([]);
  const [recordNames, setRecordNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  async function fetchAssets() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/assets?status=draft&limit=50");
      if (res.ok) {
        const data = await res.json();
        const fetchedAssets: GeneratedAsset[] = data.data ?? [];
        setAssets(fetchedAssets);

        // Fetch record names for display
        const recordIds = [...new Set(fetchedAssets.map((a) => a.recordId))];
        if (recordIds.length > 0) {
          const names: Record<string, string> = {};
          await Promise.all(
            recordIds.map(async (rid) => {
              try {
                const rRes = await fetch(`/api/v1/records/${rid}`);
                if (rRes.ok) {
                  const rData = await rRes.json();
                  // Try to extract a display name from record values
                  const values = rData.data?.values ?? {};
                  const name =
                    extractDisplayName(values) ?? `Record ${rid.slice(0, 8)}`;
                  names[rid] = name;
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
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAssets();
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Inbox className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold">Approval Inbox</h1>
          <p className="text-sm text-muted-foreground">
            AI-generated drafts waiting for your review before any customer-facing action
          </p>
        </div>
        {assets.length > 0 && (
          <span className="ml-auto rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary">
            {assets.length} pending
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <InboxList initialAssets={assets} recordNames={recordNames} />
      )}
    </div>
  );
}

function extractDisplayName(values: Record<string, unknown>): string | null {
  const nameSlugs = [
    "name",
    "deal-name",
    "full-name",
    "company-name",
    "title",
    "first-name",
    "subject",
  ];
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
