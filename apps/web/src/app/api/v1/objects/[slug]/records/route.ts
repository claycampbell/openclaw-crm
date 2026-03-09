import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, notFound, badRequest, success } from "@/lib/api-utils";
import { getObjectBySlug } from "@/services/objects";
import { listRecords, createRecord } from "@/services/records";
import { handleRecordCreated } from "@/services/crm-events";

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
  const obj = await getObjectBySlug(ctx.workspaceId, slug);
  if (!obj) return notFound("Object not found");

  const { searchParams } = new URL(req.url);
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

  // Fire-and-forget — don't await, don't let it block the response
  void handleRecordCreated({
    objectSlug: slug,
    objectSingularName: obj.singularName,
    recordId: (record as Record<string, unknown>).id as string,
    workspaceId: ctx.workspaceId,
    recordSummary: extractRecordSummary(record as Record<string, unknown>),
  }).catch(() => {}); // swallow errors

  return success(record, 201);
}
