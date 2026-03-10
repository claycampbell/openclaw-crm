import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, notFound, badRequest, requireAdmin } from "@/lib/api-utils";
import { db } from "@/db";
import { automationRules } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { id } = await params;

  const [rule] = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.id, id), eq(automationRules.workspaceId, ctx.workspaceId)))
    .limit(1);

  if (!rule) return notFound("Automation rule not found");
  return success(rule);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();
  const adminCheck = requireAdmin(ctx);
  if (adminCheck) return adminCheck;

  const { id } = await params;

  // Verify rule belongs to workspace
  const [existing] = await db
    .select({ id: automationRules.id })
    .from(automationRules)
    .where(and(eq(automationRules.id, id), eq(automationRules.workspaceId, ctx.workspaceId)))
    .limit(1);

  if (!existing) return notFound("Automation rule not found");

  const body = await req.json();
  const { name, enabled, triggerType, conditions, actionType, actionPayload } = body;

  if (
    name === undefined &&
    enabled === undefined &&
    triggerType === undefined &&
    conditions === undefined &&
    actionType === undefined &&
    actionPayload === undefined
  ) {
    return badRequest("At least one field to update is required");
  }

  const [updated] = await db
    .update(automationRules)
    .set({
      ...(name !== undefined && { name: name as string }),
      ...(enabled !== undefined && { enabled: Boolean(enabled) }),
      ...(triggerType !== undefined && { triggerType: triggerType as string }),
      ...(conditions !== undefined && { conditions: conditions as typeof automationRules.$inferInsert["conditions"] }),
      ...(actionType !== undefined && { actionType: actionType as typeof automationRules.$inferInsert["actionType"] }),
      ...(actionPayload !== undefined && { actionPayload: actionPayload as typeof automationRules.$inferInsert["actionPayload"] }),
      updatedAt: new Date(),
    })
    .where(and(eq(automationRules.id, id), eq(automationRules.workspaceId, ctx.workspaceId)))
    .returning();

  return success(updated);
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
    .delete(automationRules)
    .where(and(eq(automationRules.id, id), eq(automationRules.workspaceId, ctx.workspaceId)))
    .returning({ id: automationRules.id });

  if (!deleted) return notFound("Automation rule not found");
  return success({ id: deleted.id, deleted: true });
}
