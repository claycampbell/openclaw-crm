import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, notFound, badRequest, success } from "@/lib/api-utils";
import { getObjectBySlug } from "@/services/objects";
import { listRecords, listRecordsCursor, assertRecord } from "@/services/records";
import type { FilterGroup, SortConfig } from "@openclaw-crm/shared";

/** POST /api/v1/objects/[slug]/records/query
 *  Body: { limit?, offset?, filter?, sorts? }
 *  Supports compound AND/OR filters and multi-column sorting.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { slug } = await params;
  const obj = await getObjectBySlug(ctx.workspaceId, slug);
  if (!obj) return notFound("Object not found");

  const body = await req.json();

  // Assert mode: upsert by matching attribute
  if (body.mode === "assert" && body.matchAttribute && body.values) {
    const record = await assertRecord(
      obj.id,
      body.matchAttribute,
      body.matchValue,
      body.values,
      ctx.userId
    );
    return success(record, 200);
  }

  // Parse filter and sorts
  const filter: FilterGroup | undefined = body.filter;
  const sorts: SortConfig[] | undefined = body.sorts;

  // Cursor-based pagination mode
  if (body.cursor !== undefined) {
    const limit = Math.min(Number(body.limit || 50), 200);
    const result = await listRecordsCursor(obj.id, {
      limit,
      cursor: body.cursor || null,
      filter,
      sorts,
    });

    return success({
      records: result.records,
      pagination: { nextCursor: result.nextCursor, hasMore: result.hasMore },
    });
  }

  // Legacy offset-based pagination mode
  const limit = Math.min(Number(body.limit || 50), 200);
  const offset = Number(body.offset || 0);

  const result = await listRecords(obj.id, { limit, offset, filter, sorts });

  return success({
    records: result.records,
    pagination: { limit, offset, total: result.total },
  });
}
