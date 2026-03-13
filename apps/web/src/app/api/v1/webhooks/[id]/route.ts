import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, notFound, badRequest, requireAdmin } from "@/lib/api-utils";
import { db } from "@/db";
import { outboundWebhooks } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();
  const adminCheck = requireAdmin(ctx);
  if (adminCheck) return adminCheck;

  const { id } = await params;

  const [existing] = await db
    .select({ id: outboundWebhooks.id })
    .from(outboundWebhooks)
    .where(and(eq(outboundWebhooks.id, id), eq(outboundWebhooks.workspaceId, ctx.workspaceId)))
    .limit(1);

  if (!existing) return notFound("Webhook not found");

  const body = await req.json();
  const { name, url, events, secret, enabled } = body;

  if (url !== undefined) {
    try {
      new URL(url);
    } catch {
      return badRequest("Invalid URL");
    }
  }

  const [updated] = await db
    .update(outboundWebhooks)
    .set({
      ...(name !== undefined && { name }),
      ...(url !== undefined && { url }),
      ...(events !== undefined && { events: Array.isArray(events) ? events.join(",") : events }),
      ...(secret !== undefined && { secret: secret || null }),
      ...(enabled !== undefined && { enabled: Boolean(enabled) }),
      updatedAt: new Date(),
    })
    .where(and(eq(outboundWebhooks.id, id), eq(outboundWebhooks.workspaceId, ctx.workspaceId)))
    .returning();

  return success({ ...updated, secret: undefined, hasSecret: !!updated.secret });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();
  const adminCheck = requireAdmin(ctx);
  if (adminCheck) return adminCheck;

  const { id } = await params;

  const [deleted] = await db
    .delete(outboundWebhooks)
    .where(and(eq(outboundWebhooks.id, id), eq(outboundWebhooks.workspaceId, ctx.workspaceId)))
    .returning({ id: outboundWebhooks.id });

  if (!deleted) return notFound("Webhook not found");
  return success({ id: deleted.id, deleted: true });
}
