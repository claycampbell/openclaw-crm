import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, notFound, badRequest } from "@/lib/api-utils";
import {
  getSequence,
  updateSequence,
  deleteSequence,
} from "@/services/sequences";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { id } = await params;
  const seq = await getSequence(id, ctx.workspaceId);
  if (!seq) return notFound("Sequence not found");

  return success(seq);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { id } = await params;
  const body = await req.json();

  const seq = await updateSequence(id, ctx.workspaceId, body);
  if (!seq) return notFound("Sequence not found");

  return success(seq);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { id } = await params;
  const seq = await deleteSequence(id, ctx.workspaceId);
  if (!seq) return notFound("Sequence not found");

  return success({ deleted: true });
}
