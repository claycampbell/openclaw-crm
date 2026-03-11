import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, badRequest } from "@/lib/api-utils";
import {
  listSequences,
  createSequence,
} from "@/services/sequences";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const data = await listSequences(ctx.workspaceId);
  return success(data);
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const body = await req.json();
  if (!body.name || typeof body.name !== "string") {
    return badRequest("name is required");
  }

  const seq = await createSequence(ctx.workspaceId, ctx.userId, {
    name: body.name,
    description: body.description,
  });

  return success(seq, 201);
}
