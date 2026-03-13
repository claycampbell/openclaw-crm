import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, badRequest, requireAdmin } from "@/lib/api-utils";
import { db } from "@/db";
import { outboundWebhooks } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const webhooks = await db
    .select()
    .from(outboundWebhooks)
    .where(eq(outboundWebhooks.workspaceId, ctx.workspaceId))
    .orderBy(outboundWebhooks.createdAt);

  // Strip secrets from response
  const safe = webhooks.map(({ secret, ...rest }) => ({
    ...rest,
    hasSecret: !!secret,
  }));

  return success(safe);
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();
  const adminCheck = requireAdmin(ctx);
  if (adminCheck) return adminCheck;

  const body = await req.json();
  const { name, url, events, secret } = body;

  if (!name || !url || !events) {
    return badRequest("name, url, and events are required");
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return badRequest("Invalid URL");
  }

  const [webhook] = await db
    .insert(outboundWebhooks)
    .values({
      workspaceId: ctx.workspaceId,
      name,
      url,
      events: Array.isArray(events) ? events.join(",") : events,
      secret: secret || null,
      createdBy: ctx.userId,
    })
    .returning();

  return success({ ...webhook, secret: undefined, hasSecret: !!webhook.secret }, 201);
}
