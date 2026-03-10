"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageItem, AgentTypingIndicator } from "./message-item";

interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  toolCalls?: unknown[];
  metadata?: unknown;
  agentName?: string;
  isProactive?: boolean;
  createdAt: string;
}

interface MessageListProps {
  messages: Message[];
  streaming: boolean;
  streamingContent: string;
  userName?: string;
  userInitials?: string;
  channelName?: string;
}

function formatDateDivider(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (msgDay.getTime() === today.getTime()) return "Today";
  if (msgDay.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function MessageList({
  messages,
  streaming,
  streamingContent,
  userName,
  userInitials,
  channelName,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const isAtBottomRef = useRef(true);

  // Auto-scroll to bottom when new content arrives, only if already near bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingContent, streaming]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distFromBottom < 80;
    setShowJumpToBottom(distFromBottom > 200);
  }

  function jumpToBottom() {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowJumpToBottom(false);
  }

  const visibleMessages = messages.filter((m) => m.role !== "system");

  // Streaming bubble as a pseudo-message
  const streamingMessage: Message | null =
    streaming
      ? {
          id: "__streaming__",
          role: "assistant",
          content: streamingContent || null,
          createdAt: new Date().toISOString(),
        }
      : null;

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto"
      >
        {/* Empty state */}
        {visibleMessages.length === 0 && !streaming && (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center px-8">
            <div className="flex items-center justify-center h-16 w-16 rounded-full bg-violet-100 mb-4">
              <MessageSquare className="h-8 w-8 text-violet-500" />
            </div>
            <h2 className="text-xl font-bold text-zinc-900 mb-1">
              {channelName || "New conversation"}
            </h2>
            <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
              Ask anything about your CRM data.
            </p>
          </div>
        )}

        {/* Messages with date dividers */}
        <div className="py-4">
          {visibleMessages.map((msg, idx) => {
            const prevMsg = idx > 0 ? visibleMessages[idx - 1] : null;
            const showDivider = !prevMsg || !isSameDay(prevMsg.createdAt, msg.createdAt);

            return (
              <div key={msg.id}>
                {showDivider && (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 h-px bg-zinc-200" />
                    <span className="text-xs text-zinc-400 font-medium shrink-0">
                      {formatDateDivider(msg.createdAt)}
                    </span>
                    <div className="flex-1 h-px bg-zinc-200" />
                  </div>
                )}
                <MessageItem
                  message={msg}
                  userName={userName}
                  userInitials={userInitials}
                />
              </div>
            );
          })}

          {/* Streaming bubble */}
          {streamingMessage && (
            <div>
              {/* Show date divider if first message or new day */}
              {visibleMessages.length === 0 ||
              !isSameDay(
                visibleMessages[visibleMessages.length - 1]?.createdAt,
                streamingMessage.createdAt
              ) ? (
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 h-px bg-zinc-200" />
                  <span className="text-xs text-zinc-400 font-medium shrink-0">
                    {formatDateDivider(streamingMessage.createdAt)}
                  </span>
                  <div className="flex-1 h-px bg-zinc-200" />
                </div>
              ) : null}

              {streamingContent ? (
                <MessageItem
                  message={streamingMessage}
                  isStreaming
                  streamingContent={streamingContent}
                  userName={userName}
                  userInitials={userInitials}
                />
              ) : (
                <AgentTypingIndicator />
              )}
            </div>
          )}
        </div>

        <div ref={endRef} />
      </div>

      {/* Jump to bottom button */}
      {showJumpToBottom && (
        <button
          onClick={jumpToBottom}
          className={cn(
            "absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5",
            "bg-white border border-zinc-200 rounded-full shadow-md text-xs text-zinc-600 hover:bg-zinc-50 transition-colors"
          )}
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Jump to bottom
        </button>
      )}
    </div>
  );
}
