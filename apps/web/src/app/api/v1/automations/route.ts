import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, badRequest, requireAdmin } from "@/lib/api-utils";
import { db } from "@/db";
import { automationRules } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const rules = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.workspaceId, ctx.workspaceId))
    .orderBy(automationRules.createdAt);

  return success(rules);
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();
  const adminCheck = requireAdmin(ctx);
  if (adminCheck) return adminCheck;

  const body = await req.json();
  const { name, triggerType, conditions, actionType, actionPayload } = body;

  if (!name || !triggerType || !actionType) {
    return badRequest("name, triggerType, and actionType are required");
  }

  const [rule] = await db
    .insert(automationRules)
    .values({
      workspaceId: ctx.workspaceId,
      name,
      triggerType,
      conditions: conditions ?? [],
      actionType,
      actionPayload: actionPayload ?? {},
      createdBy: ctx.userId,
    })
    .returning();

  return success(rule, 201);
}
