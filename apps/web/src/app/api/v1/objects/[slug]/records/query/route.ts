import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, notFound, badRequest, success, resolveWorkspaceScope } from "@/lib/api-utils";
import { getObjectBySlug, getObjectsBySlugAcrossWorkspaces } from "@/services/objects";
import { listRecords, listRecordsCursor, listRecordsMultiObject, assertRecord } from "@/services/records";
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
  const body = await req.json();

  // Determine workspace scope
  const scope = resolveWorkspaceScope(ctx);
  const isRollUp = scope.length > 1;

  // For assert mode and cursor pagination, always use single workspace (writes go to primary)
  const obj = await getObjectBySlug(ctx.workspaceId, slug);
  if (!obj) return notFound("Object not found");

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

  // Multi-workspace roll-up for read queries
  if (isRollUp && body.cursor === undefined) {
    const matchingObjects = await getObjectsBySlugAcrossWorkspaces(scope, slug);
    if (matchingObjects.length > 0) {
      const objectIds = matchingObjects.map(o => o.id);
      const limit = Math.min(Number(body.limit || 50), 200);
      const offset = Number(body.offset || 0);
      const result = await listRecordsMultiObject(objectIds, { limit, offset, filter, sorts });
      return success({
        records: result.records,
        pagination: { limit, offset, total: result.total },
      });
    }
  }

  // Cursor-based pagination mode (single workspace)
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

  // Legacy offset-based pagination mode (single workspace)
  const limit = Math.min(Number(body.limit || 50), 200);
  const offset = Number(body.offset || 0);

  const result = await listRecords(obj.id, { limit, offset, filter, sorts });

  return success({
    records: result.records,
    pagination: { limit, offset, total: result.total },
  });
}
