"use client";

import { useState, useEffect, useCallback } from "react";
import { Mail, Plus, Play, Pause, BarChart2, Trash2, Archive } from "lucide-react";

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  status: string;
  steps: number;
  enrolled: number;
  replyRate: number;
  createdAt: string;
  updatedAt: string;
}

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchSequences = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/sequences");
      if (res.ok) {
        const json = await res.json();
        setSequences(json.data ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch sequences:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSequences();
  }, [fetchSequences]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/v1/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined }),
      });
      if (res.ok) {
        setNewName("");
        setNewDesc("");
        setShowCreate(false);
        fetchSequences();
      }
    } catch (err) {
      console.error("Failed to create sequence:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await fetch(`/api/v1/sequences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      fetchSequences();
    } catch (err) {
      console.error("Failed to archive sequence:", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/v1/sequences/${id}`, { method: "DELETE" });
      fetchSequences();
    } catch (err) {
      console.error("Failed to delete sequence:", err);
    }
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Email Sequences</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create multi-step outbound sequences with AI-personalized content
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Sequence
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="mb-6 rounded-lg border p-5 space-y-3">
          <h3 className="font-medium">Create New Sequence</h3>
          <input
            type="text"
            placeholder="Sequence name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            autoFocus
          />
          <textarea
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewName(""); setNewDesc(""); }}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
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
                    {seq.description && (
                      <span className="ml-2">&middot; {seq.description}</span>
                    )}
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
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleArchive(seq.id)}
                    className="p-1 rounded hover:bg-accent"
                    title="Archive"
                  >
                    <Archive className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => handleDelete(seq.id)}
                    className="p-1 rounded hover:bg-accent"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
