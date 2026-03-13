"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X, ChevronDown, UserPlus, Building2, Shield, User } from "lucide-react";

interface WorkspaceInfo {
  id: string;
  name: string;
  type: string;
}

interface Membership {
  membershipId: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  createdAt: string;
}

interface TeamUser {
  userId: string;
  name: string;
  email: string;
  memberships: Membership[];
}

export default function TeamPage() {
  const [workspacesList, setWorkspacesList] = useState<WorkspaceInfo[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editMemberships, setEditMemberships] = useState<Map<string, string>>(new Map());
  const [notAgency, setNotAgency] = useState(false);

  async function fetchTeam() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/team");
      if (res.status === 403) {
        setNotAgency(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setWorkspacesList(data.data.workspaces);
        setTeamUsers(data.data.users);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTeam(); }, []);

  function startEditing(user: TeamUser) {
    setEditingUser(user.userId);
    const map = new Map<string, string>();
    for (const m of user.memberships) {
      map.set(m.workspaceId, m.role);
    }
    setEditMemberships(map);
  }

  function toggleWorkspace(wsId: string) {
    const next = new Map(editMemberships);
    if (next.has(wsId)) {
      next.delete(wsId);
    } else {
      next.set(wsId, "member");
    }
    setEditMemberships(next);
  }

  function setRole(wsId: string, role: string) {
    const next = new Map(editMemberships);
    next.set(wsId, role);
    setEditMemberships(next);
  }

  async function saveEdits(userId: string) {
    setSaving(userId);
    try {
      const memberships = Array.from(editMemberships.entries()).map(([workspaceId, role]) => ({
        workspaceId,
        role,
      }));
      const res = await fetch(`/api/v1/team/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberships }),
      });
      if (res.ok) {
        toast.success("Memberships updated");
        setEditingUser(null);
        fetchTeam();
      } else {
        const data = await res.json();
        toast.error(data.error?.message ?? "Failed to update");
      }
    } finally {
      setSaving(null);
    }
  }

  async function removeFromWorkspace(userId: string, workspaceId: string, workspaceName: string) {
    const res = await fetch(`/api/v1/team/${userId}?workspaceId=${workspaceId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success(`Removed from ${workspaceName}`);
      fetchTeam();
    } else {
      toast.error("Failed to remove");
    }
  }

  if (notAgency) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold mb-6">Team management</h1>
        <div className="rounded-lg border border-border bg-muted/30 px-6 py-12 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            Team management is available for agency workspaces.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Switch to your agency workspace to manage users across companies.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold mb-6">Team management</h1>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const childWorkspaces = workspacesList.filter((w) => w.type !== "agency");

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Team management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage user access across {childWorkspaces.length} {childWorkspaces.length === 1 ? "company" : "companies"}
          </p>
        </div>
      </div>

      {/* Users × Companies matrix */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium min-w-[200px]">User</th>
              {workspacesList.map((ws) => (
                <th key={ws.id} className="px-3 py-3 text-center font-medium min-w-[120px]">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs truncate max-w-[100px]">{ws.name}</span>
                    {ws.type !== "company" && (
                      <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                        {ws.type === "agency" ? "AG" : ws.type === "business_unit" ? "BU" : ws.type}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              <th className="px-3 py-3 text-center font-medium w-[80px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {teamUsers.map((user) => {
              const isEditing = editingUser === user.userId;
              const memberWsIds = new Set(user.memberships.map((m) => m.workspaceId));

              return (
                <tr key={user.userId} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                        {user.name?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  {workspacesList.map((ws) => {
                    const membership = user.memberships.find((m) => m.workspaceId === ws.id);

                    if (isEditing) {
                      const isChecked = editMemberships.has(ws.id);
                      const currentRole = editMemberships.get(ws.id) ?? "member";
                      return (
                        <td key={ws.id} className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => toggleWorkspace(ws.id)}
                              className={`h-6 w-6 rounded border-2 flex items-center justify-center transition-colors ${
                                isChecked
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "border-muted-foreground/30 hover:border-muted-foreground/50"
                              }`}
                            >
                              {isChecked && <Check className="h-3.5 w-3.5" />}
                            </button>
                            {isChecked && (
                              <select
                                value={currentRole}
                                onChange={(e) => setRole(ws.id, e.target.value)}
                                className="text-[10px] rounded border border-input bg-background px-1 py-0.5 outline-none"
                              >
                                <option value="member">member</option>
                                <option value="admin">admin</option>
                              </select>
                            )}
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td key={ws.id} className="px-3 py-3 text-center">
                        {membership ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              membership.role === "admin"
                                ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            }`}>
                              {membership.role === "admin" ? (
                                <Shield className="h-3 w-3" />
                              ) : (
                                <User className="h-3 w-3" />
                              )}
                              {membership.role}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-center">
                    {isEditing ? (
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 px-2 text-xs"
                          disabled={saving === user.userId}
                          onClick={() => saveEdits(user.userId)}
                        >
                          {saving === user.userId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Save"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEditingUser(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => startEditing(user)}
                      >
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {teamUsers.length === 0 && (
              <tr>
                <td colSpan={workspacesList.length + 2} className="px-4 py-12 text-center text-muted-foreground">
                  No team members found. Add members through the Members settings page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[11px] font-medium">
            <Shield className="h-3 w-3" /> admin
          </span>
          <span>Can manage settings and members</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[11px] font-medium">
            <User className="h-3 w-3" /> member
          </span>
          <span>Standard access</span>
        </div>
      </div>
    </div>
  );
}
