"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "@/lib/auth-client";
import { ConversationList } from "@/components/chat/conversation-list";
import { MessageList } from "@/components/workspace/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { ConfirmationCard } from "@/components/chat/confirmation-card";

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  toolCalls?: unknown[];
  toolCallId?: string;
  toolName?: string;
  agentName?: string;
  isProactive?: boolean;
  metadata?: {
    pendingToolCalls?: Array<{
      id: string;
      name: string;
      arguments: string;
      status: string;
    }>;
  } | null;
  createdAt: string;
}

interface PendingToolCall {
  messageId: string;
  toolCallId: string;
  name: string;
  arguments: Record<string, unknown>;
}

export default function ChatPage() {
  const { data: session } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [pendingToolCall, setPendingToolCall] = useState<PendingToolCall | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageAtRef = useRef<string | null>(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  async function fetchConversations() {
    const res = await fetch("/api/v1/chat/conversations");
    if (res.ok) {
      const data = await res.json();
      setConversations(data.data || []);
    }
  }

  // Load messages when switching conversation
  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      lastMessageAtRef.current = null;
      return;
    }
    if (isStreamingRef.current) return;
    loadMessages(activeConvId);
  }, [activeConvId]);

  // Poll for new messages every 5 seconds when a conversation is active
  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (!activeConvId) return;

    pollIntervalRef.current = setInterval(async () => {
      if (isStreamingRef.current) return;

      const after = lastMessageAtRef.current;
      if (!after) return;

      try {
        const res = await fetch(
          `/api/v1/chat/conversations/${activeConvId}?after=${encodeURIComponent(after)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        const newMsgs: Message[] = data.data?.messages || [];
        if (newMsgs.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const fresh = newMsgs.filter((m) => !existingIds.has(m.id));
            if (fresh.length === 0) return prev;
            const last = fresh[fresh.length - 1];
            lastMessageAtRef.current = last.createdAt;
            return [...prev, ...fresh];
          });
        }
      } catch {
        // Ignore polling errors
      }
    }, 5000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [activeConvId]);

  async function loadMessages(convId: string) {
    const res = await fetch(`/api/v1/chat/conversations/${convId}`);
    if (res.ok) {
      const data = await res.json();
      const msgs: Message[] = data.data?.messages || [];
      setMessages(msgs);

      if (msgs.length > 0) {
        lastMessageAtRef.current = msgs[msgs.length - 1].createdAt;
      } else {
        lastMessageAtRef.current = new Date().toISOString();
      }

      for (const msg of msgs) {
        if (msg.metadata?.pendingToolCalls) {
          const pending = msg.metadata.pendingToolCalls.find(
            (tc: { status: string }) => tc.status === "pending"
          );
          if (pending) {
            let parsedArgs: Record<string, unknown> = {};
            try { parsedArgs = JSON.parse(pending.arguments); } catch {}
            setPendingToolCall({
              messageId: msg.id,
              toolCallId: pending.id,
              name: pending.name,
              arguments: parsedArgs,
            });
            return;
          }
        }
      }
      setPendingToolCall(null);
    }
  }

  async function handleNewConversation() {
    const res = await fetch("/api/v1/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = await res.json();
      const conv = data.data;
      setConversations((prev) => [conv, ...prev]);
      setActiveConvId(conv.id);
      setMessages([]);
      setPendingToolCall(null);
    }
  }

  async function handleDeleteConversation(id: string) {
    await fetch(`/api/v1/chat/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConvId === id) {
      setActiveConvId(null);
      setMessages([]);
      setPendingToolCall(null);
    }
  }

  function processSSELine(
    line: string,
    accumulatedRef: { current: string },
  ) {
    if (!line.startsWith("data: ")) return;
    const data = line.slice(6).trim();
    if (data === "[DONE]") return;

    try {
      const parsed = JSON.parse(data);

      switch (parsed.type) {
        case "token":
          accumulatedRef.current += parsed.content;
          setStreamingContent(accumulatedRef.current);
          break;

        case "tool_executing":
          accumulatedRef.current += `\n\u{1F527} Running **${parsed.name}**...\n`;
          setStreamingContent(accumulatedRef.current);
          break;

        case "tool_call_pending":
          setPendingToolCall({
            messageId: parsed.messageId,
            toolCallId: parsed.toolCallId,
            name: parsed.name,
            arguments: parsed.arguments,
          });
          break;

        case "error":
          accumulatedRef.current += `\n\nError: ${parsed.error}`;
          setStreamingContent(accumulatedRef.current);
          break;
      }
    } catch {
      // Skip malformed lines
    }
  }

  async function consumeSSEStream(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const decoder = new TextDecoder();
    let buffer = "";
    const accumulatedRef = { current: "" };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        processSSELine(line, accumulatedRef);
      }
    }
  }

  async function finishStreaming(convId: string | null) {
    if (convId) {
      await loadMessages(convId);
    }
    setStreaming(false);
    isStreamingRef.current = false;
    setStreamingContent("");
    abortRef.current = null;
    await fetchConversations();
  }

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming) return;

    let convId = activeConvId;

    if (!convId) {
      const res = await fetch("/api/v1/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const data = await res.json();
      convId = data.data.id;
      setConversations((prev) => [data.data, ...prev]);
      setActiveConvId(convId);
    }

    const userMessage = input.trim();
    setInput("");
    setStreaming(true);
    isStreamingRef.current = true;
    setStreamingContent("");
    setPendingToolCall(null);

    const tempMsg: Message = {
      id: "temp-" + Date.now(),
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, message: userMessage }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStreamingContent(
          `Error: ${(err as { error?: { message?: string } }).error?.message || "Failed to get response"}`
        );
        setStreaming(false);
        isStreamingRef.current = false;
        return;
      }

      await consumeSSEStream(res.body!.getReader());
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // User cancelled
      } else {
        setStreamingContent("Connection error. Please try again.");
      }
    }

    await finishStreaming(convId);
  }, [input, streaming, activeConvId]);

  async function handleApprove() {
    if (!pendingToolCall || !activeConvId) return;
    setConfirmLoading(true);
    setStreamingContent("");

    try {
      const res = await fetch("/api/v1/chat/tool-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvId,
          messageId: pendingToolCall.messageId,
          toolCallId: pendingToolCall.toolCallId,
          approved: true,
        }),
      });

      setPendingToolCall(null);

      if (!res.ok) {
        setConfirmLoading(false);
        return;
      }

      setStreaming(true);
      await consumeSSEStream(res.body!.getReader());
    } catch {
      // Stream error
    }

    setConfirmLoading(false);
    await finishStreaming(activeConvId);
  }

  async function handleReject() {
    if (!pendingToolCall || !activeConvId) return;
    setConfirmLoading(true);
    setStreamingContent("");

    try {
      const res = await fetch("/api/v1/chat/tool-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvId,
          messageId: pendingToolCall.messageId,
          toolCallId: pendingToolCall.toolCallId,
          approved: false,
        }),
      });

      setPendingToolCall(null);

      if (!res.ok) {
        setConfirmLoading(false);
        return;
      }

      setStreaming(true);
      await consumeSSEStream(res.body!.getReader());
    } catch {
      // Stream error
    }

    setConfirmLoading(false);
    await finishStreaming(activeConvId);
  }

  const visibleMessages = messages.filter((m) => {
    if (m.role === "system") return false;
    if (m.id.startsWith("temp-") && messages.some(
      (r) => !r.id.startsWith("temp-") && r.role === "user" && r.content === m.content
    )) return false;
    return true;
  });

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const convTitle = activeConv?.title || null;

  const userName = session?.user?.name || "";
  const userEmail = session?.user?.email || "";
  const userInitials = userName
    ? userName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : userEmail.slice(0, 2).toUpperCase();

  return (
    <div className="flex h-full overflow-hidden">
      {/* Conversation list */}
      <div className="w-56 shrink-0 border-r border-border overflow-hidden">
        <ConversationList
          conversations={conversations}
          activeId={activeConvId}
          onSelect={setActiveConvId}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
        />
      </div>

      {/* Chat area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Minimal header */}
        <div className="flex items-center h-11 px-4 border-b border-border shrink-0">
          <span className="text-sm font-medium text-foreground truncate">
            {convTitle || "New conversation"}
          </span>
        </div>

        <MessageList
          messages={visibleMessages}
          streaming={streaming}
          streamingContent={streamingContent}
          userName={userName}
          userInitials={userInitials}
          channelName={convTitle || undefined}
        />

        {pendingToolCall && (
          <div className="px-4 pb-2">
            <ConfirmationCard
              toolName={pendingToolCall.name}
              toolArgs={pendingToolCall.arguments}
              onApprove={handleApprove}
              onReject={handleReject}
              loading={confirmLoading}
            />
          </div>
        )}

        <ChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          disabled={streaming || !!pendingToolCall}
          streaming={streaming}
        />
      </div>
    </div>
  );
}
