/**
 * GET /api/v1/records/[recordId]
 * Fetch a single record by ID (without knowing the object slug).
 * Used by the approval inbox to resolve record display names.
 */
import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, notFound, success } from "@/lib/api-utils";
import { db } from "@/db";
import { records, objects, recordValues, attributes } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ recordId: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { recordId } = await params;

  // Load record, verify it belongs to this workspace via objects join
  const [record] = await db
    .select({
      id: records.id,
      objectId: records.objectId,
      createdAt: records.createdAt,
    })
    .from(records)
    .innerJoin(objects, eq(records.objectId, objects.id))
    .where(
      and(
        eq(records.id, recordId),
        eq(objects.workspaceId, ctx.workspaceId)
      )
    )
    .limit(1);

  if (!record) return notFound("Record not found");

  // Load key display attributes (name, title, email)
  const valueRows = await db
    .select({
      slug: attributes.slug,
      textValue: recordValues.textValue,
    })
    .from(recordValues)
    .innerJoin(attributes, eq(recordValues.attributeId, attributes.id))
    .where(eq(recordValues.recordId, recordId));

  const values: Record<string, string> = {};
  for (const row of valueRows) {
    if (row.textValue !== null) {
      values[row.slug] = row.textValue;
    }
  }

  return success({ id: record.id, objectId: record.objectId, values, createdAt: record.createdAt });
}
