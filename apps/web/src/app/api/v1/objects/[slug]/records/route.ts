import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, notFound, badRequest, success, resolveWorkspaceScope } from "@/lib/api-utils";
import { getObjectBySlug, getObjectsBySlugAcrossWorkspaces } from "@/services/objects";
import { listRecords, listRecordsCursor, listRecordsMultiObject, createRecord } from "@/services/records";
import { handleRecordCreated } from "@/services/crm-events";
import { scheduleEnrichment } from "@/services/integrations/linkedin";

// Extract a human-readable summary from a record's attribute values
function extractRecordSummary(record: Record<string, unknown>): string {
  const values = record.values as Record<string, unknown> | undefined;
  if (!values) return "Unnamed record";

  const nameSlugs = ["name", "full-name", "company-name", "deal-name", "title", "first-name"];
  for (const slug of nameSlugs) {
    const val = values[slug];
    if (!val) continue;
    // Handle personal_name objects
    if (typeof val === "object" && val !== null) {
      const nameObj = val as Record<string, unknown>;
      if (typeof nameObj.fullName === "string" && nameObj.fullName.trim()) {
        return nameObj.fullName.trim();
      }
      if (typeof nameObj.firstName === "string" && nameObj.firstName.trim()) {
        const last = typeof nameObj.lastName === "string" ? ` ${nameObj.lastName}` : "";
        return `${nameObj.firstName}${last}`.trim();
      }
    }
    if (typeof val === "string" && val.trim()) {
      return val.trim();
    }
  }
  return "Unnamed record";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { slug } = await params;

  // Determine if we need multi-workspace roll-up
  const scope = resolveWorkspaceScope(ctx);
  const isRollUp = scope.length > 1;

  if (isRollUp) {
    // Multi-workspace: find objects with this slug across all scoped workspaces
    const matchingObjects = await getObjectsBySlugAcrossWorkspaces(scope, slug);
    if (matchingObjects.length === 0) return notFound("Object not found");

    const objectIds = matchingObjects.map(o => o.id);
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") || 50), 200);
    const offset = Number(searchParams.get("offset") || 0);

    const result = await listRecordsMultiObject(objectIds, { limit, offset });

    return success({
      records: result.records,
      pagination: { limit, offset, total: result.total },
    });
  }

  // Single workspace: original behavior
  const obj = await getObjectBySlug(ctx.workspaceId, slug);
  if (!obj) return notFound("Object not found");

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");

  // Cursor-based pagination mode
  if (cursor !== null) {
    const limit = Math.min(Number(searchParams.get("limit") || 50), 200);
    const result = await listRecordsCursor(obj.id, {
      limit,
      cursor: cursor || null, // empty string = first page
    });

    return success({
      records: result.records,
      pagination: { nextCursor: result.nextCursor, hasMore: result.hasMore },
    });
  }

  // Legacy offset-based pagination mode
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);
  const offset = Number(searchParams.get("offset") || 0);

  const result = await listRecords(obj.id, { limit, offset });

  return success({
    records: result.records,
    pagination: { limit, offset, total: result.total },
  });
}

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
  const { values } = body;

  if (!values || typeof values !== "object") {
    return badRequest("values object is required");
  }

  const record = await createRecord(obj.id, values, ctx.userId);

  const recordId = (record as unknown as Record<string, unknown>).id as string;

  // Fire-and-forget — don't await, don't let it block the response
  void handleRecordCreated({
    objectSlug: slug,
    objectSingularName: obj.singularName,
    recordId,
    workspaceId: ctx.workspaceId,
    recordSummary: extractRecordSummary(record as unknown as Record<string, unknown>),
  }).catch(() => {}); // swallow errors

  // Auto-enrich new People records when email is provided
  if (slug === "people" && values["email"]) {
    const email = values["email"] as string;
    void scheduleEnrichment(ctx.workspaceId, recordId, "people", email).catch(() => {});
  }

  return success(record, 201);
}
