import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// Find or create a named channel for a workspace
export async function getOrCreateChannel(
  workspaceId: string,
  channelName: string // "general" | "deals" | "tasks"
): Promise<string> {
  // Look for existing channel
  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.channelName, channelName),
        eq(conversations.channelType, "channel")
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  // Create the channel
  const [conv] = await db
    .insert(conversations)
    .values({
      workspaceId,
      userId: "system", // system-owned channel
      title: channelName,
      channelName,
      channelType: "channel",
    })
    .returning({ id: conversations.id });

  return conv.id;
}

// Post a message to a channel as the Aria agent (fire-and-forget safe)
export async function postAgentMessage(
  conversationId: string,
  content: string,
  agentName: string = "Aria"
): Promise<void> {
  await db.insert(messages).values({
    conversationId,
    role: "assistant",
    content,
    agentName,
    isProactive: true,
  });

  // Update the conversation's updatedAt
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

// Create all default channels for a new workspace
export async function seedDefaultChannels(workspaceId: string): Promise<void> {
  await getOrCreateChannel(workspaceId, "general");
  await getOrCreateChannel(workspaceId, "deals");
  await getOrCreateChannel(workspaceId, "tasks");
}

// List all channels for a workspace (channelType = "channel")
export async function listChannels(
  workspaceId: string
): Promise<Array<{ id: string; title: string; channelName: string; updatedAt: string }>> {
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      channelName: conversations.channelName,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.channelType, "channel")
      )
    );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    channelName: r.channelName ?? "",
    updatedAt: r.updatedAt.toISOString(),
  }));
}
