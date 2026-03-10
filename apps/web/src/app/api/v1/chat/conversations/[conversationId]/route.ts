import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, notFound, success } from "@/lib/api-utils";
import {
  getConversation,
  updateConversation,
  deleteConversation,
  getConversationMessages,
} from "@/services/ai-chat";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { eq, and, gt, asc } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return unauthorized();

    const { conversationId } = await params;
    const conv = await getConversation(conversationId, ctx.userId);
    if (!conv) return notFound("Conversation not found");

    // Support ?after=<ISO timestamp> for lightweight polling
    const { searchParams } = new URL(req.url);
    const afterParam = searchParams.get("after");

    let msgs;
    if (afterParam) {
      const afterDate = new Date(afterParam);
      msgs = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            gt(messages.createdAt, afterDate)
          )
        )
        .orderBy(asc(messages.createdAt));
    } else {
      msgs = await getConversationMessages(conversationId);
    }

    return success({ ...conv, messages: msgs });
  } catch (err) {
    console.error("GET /api/v1/chat/conversations/[id] error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: String(err) } },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return unauthorized();

    const { conversationId } = await params;
    const body = await req.json();
    const { title, model } = body as { title?: string; model?: string };

    const updated = await updateConversation(conversationId, ctx.userId, { title, model });
    if (!updated) return notFound("Conversation not found");

    return success(updated);
  } catch (err) {
    console.error("PATCH /api/v1/chat/conversations/[id] error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: String(err) } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return unauthorized();

    const { conversationId } = await params;
    const deleted = await deleteConversation(conversationId, ctx.userId);
    if (!deleted) return notFound("Conversation not found");

    return success({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/chat/conversations/[id] error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: String(err) } },
      { status: 500 }
    );
  }
}
