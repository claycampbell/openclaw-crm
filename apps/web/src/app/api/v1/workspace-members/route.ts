import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success, badRequest, forbidden } from "@/lib/api-utils";
import { listMembers, addMemberByEmail } from "@/services/workspace";
import { db } from "@/db";
import { workspaceInvites, workspaces } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const members = await listMembers(ctx.workspaceId);

  // Also return pending invites
  const invites = await db
    .select({
      id: workspaceInvites.id,
      email: workspaceInvites.email,
      role: workspaceInvites.role,
      token: workspaceInvites.token,
      createdAt: workspaceInvites.createdAt,
    })
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.workspaceId, ctx.workspaceId),
        isNull(workspaceInvites.acceptedAt)
      )
    );

  return success({ members, invites });
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  if (ctx.workspaceRole !== "admin") {
    return forbidden("Only admins can invite members");
  }

  const body = await req.json();
  const { email, role } = body;

  if (!email) return badRequest("email is required");

  const normalizedEmail = email.toLowerCase().trim();

  // Try to add directly if user already exists
  try {
    const member = await addMemberByEmail(ctx.workspaceId, normalizedEmail, role ?? "member");
    return success({ type: "added", member }, 201);
  } catch {
    // User doesn't exist yet — create an invite link instead
  }

  // Check for existing pending invite
  const existing = await db
    .select()
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.workspaceId, ctx.workspaceId),
        eq(workspaceInvites.email, normalizedEmail),
        isNull(workspaceInvites.acceptedAt)
      )
    )
    .limit(1);

  let token: string;
  if (existing.length > 0) {
    token = existing[0].token;
  } else {
    const [invite] = await db
      .insert(workspaceInvites)
      .values({
        workspaceId: ctx.workspaceId,
        email: normalizedEmail,
        role: (role ?? "member") as "admin" | "member",
        createdBy: ctx.userId,
      })
      .returning();
    token = invite.token;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return success({ type: "invited", inviteLink: `${appUrl}/invite/${token}`, email: normalizedEmail }, 201);
}
