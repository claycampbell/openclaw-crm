import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaceInvites, workspaces } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const result = await db
    .select({
      email: workspaceInvites.email,
      role: workspaceInvites.role,
      workspaceName: workspaces.name,
    })
    .from(workspaceInvites)
    .innerJoin(workspaces, eq(workspaceInvites.workspaceId, workspaces.id))
    .where(and(eq(workspaceInvites.token, token), isNull(workspaceInvites.acceptedAt)))
    .limit(1);

  if (result.length === 0) {
    return NextResponse.json(
      { error: { message: "Invalid or expired invite link." } },
      { status: 404 }
    );
  }

  return NextResponse.json({
    data: {
      workspaceName: result[0].workspaceName,
      email: result[0].email,
      role: result[0].role,
    },
  });
}
