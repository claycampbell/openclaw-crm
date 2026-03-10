import { NextRequest } from "next/server";
import {
  getAuthContext,
  unauthorized,
  notFound,
  badRequest,
  success,
} from "@/lib/api-utils";
import { db } from "@/db";
import { records, objects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getActivityTimeline } from "@/services/activity-timeline";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ recordId: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { recordId } = await params;

  // Verify the record belongs to this workspace (via objects table)
  const recordRows = await db
    .select({ id: records.id })
    .from(records)
    .innerJoin(objects, eq(records.objectId, objects.id))
    .where(
      and(
        eq(records.id, recordId),
        eq(objects.workspaceId, ctx.workspaceId)
      )
    )
    .limit(1);

  if (recordRows.length === 0) {
    return notFound("Record not found");
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") ?? null;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 25;

  if (isNaN(limit) || limit < 1 || limit > 100) {
    return badRequest("limit must be between 1 and 100");
  }

  const result = await getActivityTimeline(ctx.workspaceId, recordId, cursor, limit);

  return success(result);
}
