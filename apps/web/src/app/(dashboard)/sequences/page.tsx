"use client";

import { useState, useEffect } from "react";
import { Mail, Plus, Play, Pause, BarChart2 } from "lucide-react";

interface Sequence {
  id: string;
  name: string;
  steps: number;
  enrolled: number;
  status: "active" | "paused" | "draft";
  replyRate: number;
}

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: fetch from /api/v1/sequences once backend is wired
    setLoading(false);
  }, []);

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Email Sequences</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create multi-step outbound sequences with AI-personalized content
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          New Sequence
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : sequences.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Mail className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No sequences yet</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Create your first email sequence to automate outbound outreach.
            AI will personalize each step based on prospect context.
          </p>
          <button className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            Create Sequence
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sequences.map((seq) => (
            <div
              key={seq.id}
              className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="font-medium">{seq.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {seq.steps} steps &middot; {seq.enrolled} enrolled
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <BarChart2 className="h-4 w-4" />
                  {seq.replyRate}% reply rate
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    seq.status === "active"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : seq.status === "paused"
                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {seq.status === "active" ? (
                    <Play className="h-3 w-3" />
                  ) : (
                    <Pause className="h-3 w-3" />
                  )}
                  {seq.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
