import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, notFound, badRequest, success } from "@/lib/api-utils";
import { getObjectBySlug } from "@/services/objects";
import { getRecord, updateRecord, deleteRecord } from "@/services/records";
import { handleRecordUpdated } from "@/services/crm-events";

function extractRecordSummary(record: Record<string, unknown>): string {
  const values = record.values as Record<string, unknown> | undefined;
  if (!values) return "Unnamed record";

  const nameSlugs = ["name", "full-name", "company-name", "deal-name", "title", "first-name"];
  for (const slug of nameSlugs) {
    const val = values[slug];
    if (!val) continue;
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
  { params }: { params: Promise<{ slug: string; recordId: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { slug, recordId } = await params;
  const obj = await getObjectBySlug(ctx.workspaceId, slug);
  if (!obj) return notFound("Object not found");

  const record = await getRecord(obj.id, recordId);
  if (!record) return notFound("Record not found");

  return success(record);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; recordId: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { slug, recordId } = await params;
  const obj = await getObjectBySlug(ctx.workspaceId, slug);
  if (!obj) return notFound("Object not found");

  const body = await req.json();
  const { values } = body;

  if (!values || typeof values !== "object") {
    return badRequest("values object is required");
  }

  const record = await updateRecord(obj.id, recordId, values, ctx.userId);
  if (!record) return notFound("Record not found");

  // Fire-and-forget — don't await, don't let it block the response
  void handleRecordUpdated({
    objectSlug: slug,
    objectSingularName: obj.singularName,
    recordId: (record as unknown as Record<string, unknown>).id as string,
    workspaceId: ctx.workspaceId,
    recordSummary: extractRecordSummary(record as unknown as Record<string, unknown>),
    changedFields: Object.keys(values),
  }).catch(() => {}); // swallow errors

  return success(record);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; recordId: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { slug, recordId } = await params;
  const obj = await getObjectBySlug(ctx.workspaceId, slug);
  if (!obj) return notFound("Object not found");

  const deleted = await deleteRecord(obj.id, recordId);
  if (!deleted) return notFound("Record not found");

  return success({ id: deleted.id, deleted: true });
}
