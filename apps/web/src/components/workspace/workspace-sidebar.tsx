"use client";

import { useState } from "react";
import { Hash, Plus, Search, Settings, Pencil, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkspaceSidebarProps {
  channels: { id: string; title: string; channelName: string; updatedAt: string }[];
  conversations: { id: string; title: string; updatedAt: string }[];
  activeConvId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  userName: string;
  userEmail: string;
}

function getUserInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = [
  "bg-violet-600",
  "bg-blue-600",
  "bg-emerald-600",
  "bg-rose-600",
  "bg-amber-600",
  "bg-cyan-600",
];

function pickColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function WorkspaceSidebar({
  channels,
  conversations,
  activeConvId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  userName,
  userEmail,
}: WorkspaceSidebarProps) {
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);
  const initials = getUserInitials(userName || userEmail || "U");
  const avatarColor = pickColor(userName || userEmail || "U");

  return (
    <div className="flex flex-col w-64 shrink-0 bg-zinc-900 text-zinc-100 h-full select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/60">
        <span className="font-bold text-white text-base tracking-tight">Aria</span>
        <button
          onClick={onNewConversation}
          title="New thread"
          className="flex items-center justify-center h-7 w-7 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <button className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm transition-colors">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left text-xs">Search</span>
          <span className="text-xs text-zinc-500">⌘K</span>
        </button>
      </div>

      {/* Scrollable nav area */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-4">
        {/* Channels section — fixed agent-owned channels */}
        <div>
          <div className="flex items-center justify-between px-2 py-1 mt-1">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Channels
            </span>
          </div>

          <div className="space-y-0.5">
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => onSelectConversation(ch.id)}
                className={cn(
                  "w-full flex items-center gap-1.5 px-2 py-1 rounded text-sm text-left transition-colors",
                  activeConvId === ch.id
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                )}
              >
                <Hash className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="flex-1 truncate text-xs">
                  {ch.channelName || ch.title}
                </span>
              </button>
            ))}

            {channels.length === 0 && (
              <p className="px-2 py-1 text-xs text-zinc-500">No channels yet</p>
            )}
          </div>
        </div>

        {/* Threads section — user conversations */}
        <div>
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Threads
            </span>
            <button
              onClick={onNewConversation}
              title="New thread"
              className="flex items-center justify-center h-5 w-5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-0.5">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className="relative group"
                onMouseEnter={() => setHoveredConvId(conv.id)}
                onMouseLeave={() => setHoveredConvId(null)}
              >
                <button
                  onClick={() => onSelectConversation(conv.id)}
                  className={cn(
                    "w-full flex items-center gap-1.5 px-2 py-1 rounded text-sm text-left transition-colors",
                    activeConvId === conv.id
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  )}
                >
                  <Hash className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="flex-1 truncate text-xs">
                    {conv.title || "New conversation"}
                  </span>
                </button>

                {/* Delete button on hover */}
                {hoveredConvId === conv.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                    }}
                    title="Delete"
                    className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center h-5 w-5 rounded hover:bg-zinc-600 text-zinc-500 hover:text-zinc-200 text-xs transition-colors"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}

            {conversations.length === 0 && (
              <p className="px-2 py-1 text-xs text-zinc-500">No threads yet</p>
            )}
          </div>
        </div>

        {/* Agents section */}
        <div>
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Agents
            </span>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-800 transition-colors cursor-default">
              <div className="relative shrink-0">
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-xs font-bold">
                  A
                </div>
                {/* Green online dot */}
                <Circle className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 fill-emerald-500 text-emerald-500" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-zinc-200 font-medium truncate">Aria</span>
                <span className="text-[10px] text-zinc-500 truncate">CRM Assistant</span>
              </div>
            </div>
          </div>
        </div>

        {/* Direct Messages section */}
        <div>
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Direct Messages
            </span>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-800 transition-colors cursor-default">
              <div
                className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0",
                  avatarColor
                )}
              >
                {initials}
              </div>
              <span className="text-xs text-zinc-400 truncate">
                {userName || userEmail}{" "}
                <span className="text-zinc-600">you</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-3 py-3 border-t border-zinc-700/60">
        <div
          className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0",
            avatarColor
          )}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-zinc-200 truncate">{userName || userEmail}</p>
          {userName && (
            <p className="text-[10px] text-zinc-500 truncate">{userEmail}</p>
          )}
        </div>
        <button
          title="Settings"
          className="flex items-center justify-center h-7 w-7 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
