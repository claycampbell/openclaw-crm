import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, badRequest, notFound } from "@/lib/api-utils";
import { getSequence, addStep } from "@/services/sequences";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { id } = await params;

  // Verify sequence belongs to workspace
  const seq = await getSequence(id, ctx.workspaceId);
  if (!seq) return notFound("Sequence not found");

  const body = await req.json();
  if (!body.subject || !body.body) {
    return badRequest("subject and body are required");
  }

  const step = await addStep(id, ctx.workspaceId, {
    stepNumber: body.stepNumber ?? (seq.steps.length + 1),
    delayDays: body.delayDays ?? 0,
    subject: body.subject,
    body: body.body,
    variant: body.variant,
    variantWeight: body.variantWeight,
  });

  return success(step, 201);
}
