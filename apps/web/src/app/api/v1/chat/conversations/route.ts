import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, success, badRequest } from "@/lib/api-utils";
import { listConversations, createConversation } from "@/services/ai-chat";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return unauthorized();

    const convs = await listConversations(ctx.userId, ctx.workspaceId);
    return success(convs);
  } catch (err) {
    console.error("GET /api/v1/chat/conversations error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: String(err) } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const { title, model } = body as { title?: string; model?: string };

    const conv = await createConversation(ctx.userId, ctx.workspaceId, { title, model });
    return success(conv, 201);
  } catch (err) {
    console.error("POST /api/v1/chat/conversations error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: String(err) } },
      { status: 500 }
    );
  }
}
