import { NextRequest } from "next/server";
import { getAuthContext, success, unauthorized, badRequest } from "@/lib/api-utils";
import { flagAsJoint } from "@/services/records";

/**
 * POST /api/v1/records/:recordId/joint
 * Toggle the joint opportunity flag on a record.
 * Body: { isJoint: boolean }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ recordId: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { recordId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (typeof body.isJoint !== "boolean") {
    return badRequest("isJoint must be a boolean");
  }

  const updated = await flagAsJoint(recordId, body.isJoint);
  if (!updated) return badRequest("Record not found");

  return success(updated);
}
