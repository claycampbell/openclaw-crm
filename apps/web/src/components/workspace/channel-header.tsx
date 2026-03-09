"use client";

import { Hash, Users, Search } from "lucide-react";

interface ChannelHeaderProps {
  title: string | null;
  memberCount?: number;
}

export function ChannelHeader({ title, memberCount = 2 }: ChannelHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 bg-white shrink-0">
      {/* Left: channel name */}
      <div className="flex items-center gap-1.5 min-w-0">
        <Hash className="h-4 w-4 text-zinc-400 shrink-0" />
        {title ? (
          <span className="font-semibold text-sm text-zinc-900 truncate">{title}</span>
        ) : (
          <span className="text-sm text-zinc-400 italic">Select a channel</span>
        )}
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-1 shrink-0">
        <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 text-xs transition-colors">
          <Users className="h-4 w-4" />
          <span>{memberCount}</span>
        </button>
        <button className="flex items-center justify-center h-8 w-8 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors">
          <Search className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
