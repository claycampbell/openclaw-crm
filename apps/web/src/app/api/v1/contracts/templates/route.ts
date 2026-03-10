import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, badRequest, requireAdmin } from "@/lib/api-utils";
import { listContractTemplates, createContractTemplate, seedDefaultTemplates } from "@/services/contracts";

/**
 * GET /api/v1/contracts/templates
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const url = new URL(req.url);
  // Auto-seed default templates on first load if none exist
  if (url.searchParams.get("seed") === "true") {
    await seedDefaultTemplates(ctx.workspaceId, ctx.userId);
  }

  const templates = await listContractTemplates(ctx.workspaceId);
  return success(templates);
}

/**
 * POST /api/v1/contracts/templates
 * Create a contract template. Admin only.
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const adminErr = requireAdmin(ctx);
  if (adminErr) return adminErr;

  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.contractType) {
    return badRequest("name and contractType are required");
  }

  const template = await createContractTemplate(
    ctx.workspaceId,
    {
      name: body.name,
      contractType: body.contractType,
      description: body.description,
      clauses: body.clauses ?? [],
      defaults: body.defaults ?? {},
    },
    ctx.userId
  );

  return success(template, 201);
}
