"use client";

import { useRef, useEffect, KeyboardEvent } from "react";
import { Send, Bold, Italic, Code, Link, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  streaming?: boolean;
  channelName?: string;
}

export function MessageInput({
  value,
  onChange,
  onSend,
  disabled,
  streaming,
  channelName,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(Math.max(el.scrollHeight, 40), 200) + "px";
  }, [value]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSend();
      }
    }
  }

  const canSend = !disabled && value.trim().length > 0;
  const placeholder = streaming
    ? "Aria is responding..."
    : `Message #${channelName || "channel"}`;

  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-300 bg-white shadow-sm transition-shadow",
        !disabled && "focus-within:border-violet-400 focus-within:shadow-md focus-within:shadow-violet-100/50"
      )}
    >
      {/* Formatting toolbar */}
      <div className="flex items-center gap-0.5 px-3 pt-2 pb-1 border-b border-zinc-100">
        <ToolbarButton icon={<Bold className="h-3.5 w-3.5" />} title="Bold" />
        <ToolbarButton icon={<Italic className="h-3.5 w-3.5" />} title="Italic" />
        <ToolbarButton icon={<Code className="h-3.5 w-3.5" />} title="Code" />
        <div className="w-px h-4 bg-zinc-200 mx-1" />
        <ToolbarButton icon={<Link className="h-3.5 w-3.5" />} title="Link" />
        <div className="w-px h-4 bg-zinc-200 mx-1" />
        <ToolbarButton icon={<AtSign className="h-3.5 w-3.5" />} title="Mention" />
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className={cn(
          "w-full resize-none px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400",
          "bg-transparent border-none outline-none focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "min-h-[40px]"
        )}
        style={{ maxHeight: 200 }}
      />

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-3 pb-2 pt-1">
        <span className="text-[11px] text-zinc-400">
          <kbd className="bg-zinc-100 border border-zinc-200 rounded px-1 py-0.5 text-[10px] font-mono">
            Shift+Enter
          </kbd>{" "}
          for new line
        </span>

        <button
          onClick={onSend}
          disabled={!canSend}
          title="Send message"
          className={cn(
            "flex items-center justify-center h-7 w-7 rounded transition-all",
            canSend
              ? "bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
              : "bg-zinc-100 text-zinc-300 cursor-not-allowed"
          )}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className="flex items-center justify-center h-6 w-6 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
    >
      {icon}
    </button>
  );
}
