import { NextRequest } from "next/server";
import {
  getAuthContext,
  unauthorized,
  badRequest,
  success,
} from "@/lib/api-utils";
import { sendEmail } from "@/services/integrations/outlook";

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const body = await req.json() as {
    to?: string[];
    subject?: string;
    body?: string;
    replyToThreadId?: string;
  };

  if (!body.to || body.to.length === 0) return badRequest("to is required");
  if (!body.subject) return badRequest("subject is required");
  if (!body.body) return badRequest("body is required");

  try {
    const messageId = await sendEmail(ctx.workspaceId, ctx.userId, {
      to: body.to,
      subject: body.subject,
      body: body.body,
      replyToThreadId: body.replyToThreadId,
    });
    return success({ messageId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return badRequest(message);
  }
}
