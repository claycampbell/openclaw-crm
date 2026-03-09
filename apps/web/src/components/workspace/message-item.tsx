"use client";

import { useState } from "react";
import { Copy, ThumbsUp, ThumbsDown, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageItemProps {
  message: {
    id: string;
    role: "user" | "assistant" | "system" | "tool";
    content: string | null;
    toolCalls?: unknown[];
    metadata?: unknown;
    agentName?: string;
    isProactive?: boolean;
    createdAt: string;
  };
  isStreaming?: boolean;
  streamingContent?: string;
  userName?: string;
  userInitials?: string;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function getUserInitials(name?: string): string {
  if (!name) return "U";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ─── Markdown rendering (extracted from original message-list) ────────────────

function SimpleMarkdown({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const code = part.slice(3, -3).replace(/^\w+\n/, "");
          return (
            <pre
              key={i}
              className="bg-zinc-100 rounded-md p-2 my-2 overflow-x-auto text-xs font-mono"
            >
              <code>{code}</code>
            </pre>
          );
        }

        return (
          <span key={i}>
            {part.split("\n").map((line, j, arr) => (
              <span key={j}>
                <InlineMarkdown line={line} />
                {j < arr.length - 1 && <br />}
              </span>
            ))}
          </span>
        );
      })}
    </>
  );
}

function InlineMarkdown({ line }: { line: string }) {
  const headerMatch = line.match(/^(#{1,3})\s(.+)/);
  if (headerMatch) {
    const level = headerMatch[1].length;
    const text = headerMatch[2];
    if (level === 1)
      return <strong className="text-base block mt-2">{text}</strong>;
    if (level === 2)
      return <strong className="text-sm block mt-1.5">{text}</strong>;
    return <strong className="block mt-1">{text}</strong>;
  }

  if (line.match(/^[-*]\s/)) {
    return (
      <span className="block pl-2">
        {"• "}
        {line.slice(2)}
      </span>
    );
  }

  const numMatch = line.match(/^(\d+)\.\s(.+)/);
  if (numMatch) {
    return (
      <span className="block pl-2">
        {numMatch[1]}. {numMatch[2]}
      </span>
    );
  }

  const formatted = line
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /`([^`]+)`/g,
      '<code class="bg-zinc-200 rounded px-1 py-0.5 text-xs font-mono">$1</code>'
    );

  return <span dangerouslySetInnerHTML={{ __html: formatted }} />;
}

// ─── Typing indicator variant ─────────────────────────────────────────────────

export function AgentTypingIndicator() {
  return (
    <div className="flex gap-3 items-start px-4 py-2">
      {/* Avatar */}
      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
        A
      </div>
      <div className="flex flex-col gap-0.5 pt-1">
        <span className="text-xs font-semibold text-zinc-900">Aria</span>
        <div className="flex items-center gap-1 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MessageItem({
  message,
  isStreaming,
  streamingContent,
  userName,
  userInitials,
}: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const isAssistant = message.role === "assistant";
  const isUser = message.role === "user";
  const isProactive = message.isProactive === true || (isAssistant && !!message.agentName);

  const displayContent =
    isStreaming && streamingContent != null
      ? streamingContent
      : message.content;

  const timeString = formatTime(message.createdAt);
  const initials = userInitials || getUserInitials(userName);

  function handleCopy() {
    const text = displayContent || "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const toolCallsArray = Array.isArray(message.toolCalls) ? message.toolCalls : [];

  return (
    <div
      className={cn(
        "group relative flex gap-3 items-start px-4 py-2 hover:bg-zinc-50/80 transition-colors",
        isAssistant && "border-l-2 border-l-violet-300 pl-3"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        {isAssistant ? (
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-xs font-bold">
            A
          </div>
        ) : (
          <div className="h-8 w-8 rounded-full bg-zinc-300 flex items-center justify-center text-zinc-700 text-xs font-bold">
            {initials}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Author + timestamp */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-zinc-900">
            {isAssistant ? (message.agentName || "Aria") : (userName || "You")}
          </span>
          {isProactive && (
            <span className="bg-violet-100 text-violet-700 text-[10px] px-1.5 py-0.5 rounded-full leading-none">
              agent
            </span>
          )}
          <span className="text-xs text-zinc-400">{timeString}</span>
        </div>

        {/* Message text */}
        {displayContent && (
          <div className="text-sm text-zinc-800 whitespace-pre-wrap break-words leading-relaxed prose prose-sm max-w-none">
            <SimpleMarkdown content={displayContent} />
            {isStreaming && (
              <span className="inline-block w-0.5 h-4 bg-violet-500 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </div>
        )}

        {/* Tool calls as collapsed cards */}
        {toolCallsArray.length > 0 && (
          <div className="mt-2 space-y-1">
            {toolCallsArray.map((tc, idx) => {
              const tool = tc as { id?: string; name?: string; function?: { name?: string }; status?: string };
              const toolName = tool.name || tool.function?.name || "tool";
              return (
                <div
                  key={tool.id || idx}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-100 border border-zinc-200 text-xs text-zinc-600"
                >
                  <Wrench className="h-3 w-3 text-zinc-400 shrink-0" />
                  <span className="font-mono">{toolName}</span>
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                      tool.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : tool.status === "error"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    )}
                  >
                    {tool.status || "called"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hover action bar */}
      {hovered && (
        <div className="absolute right-4 top-1 flex items-center gap-0.5 bg-white border border-zinc-200 rounded-lg shadow-sm px-1 py-0.5">
          <button
            onClick={handleCopy}
            title="Copy"
            className="flex items-center justify-center h-6 w-6 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          {copied && (
            <span className="text-[10px] text-zinc-500 pr-1">Copied!</span>
          )}
          <button
            title="Helpful"
            className="flex items-center justify-center h-6 w-6 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            title="Not helpful"
            className="flex items-center justify-center h-6 w-6 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
