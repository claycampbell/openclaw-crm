import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, badRequest, success } from "@/lib/api-utils";
import { db } from "@/db";
import { workspaceInvites, workspaceMembers } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { token } = await params;

  const [invite] = await db
    .select()
    .from(workspaceInvites)
    .where(and(eq(workspaceInvites.token, token), isNull(workspaceInvites.acceptedAt)))
    .limit(1);

  if (!invite) return badRequest("Invalid or expired invite link.");

  // Add to workspace if not already a member
  await db
    .insert(workspaceMembers)
    .values({ workspaceId: invite.workspaceId, userId: ctx.userId, role: invite.role })
    .onConflictDoNothing();

  // Mark invite accepted
  await db
    .update(workspaceInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(workspaceInvites.id, invite.id));

  return success({ workspaceId: invite.workspaceId });
}
