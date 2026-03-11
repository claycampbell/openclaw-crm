import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, badRequest, notFound } from "@/lib/api-utils";
import { getSequence, enrollContact } from "@/services/sequences";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { id } = await params;

  const seq = await getSequence(id, ctx.workspaceId);
  if (!seq) return notFound("Sequence not found");

  const body = await req.json();
  if (!body.contactRecordId) {
    return badRequest("contactRecordId is required");
  }

  const enrollment = await enrollContact(id, ctx.workspaceId, body.contactRecordId);
  return success(enrollment, 201);
}
