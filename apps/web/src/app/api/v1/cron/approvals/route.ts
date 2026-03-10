import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { expireOverdueRequests } from "@/services/approvals";

/**
 * GET /api/v1/cron/approvals
 * Expires overdue approval requests across all workspaces.
 * Should be called periodically (e.g., every 30 minutes) by a cron job.
 *
 * Protected by CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const allWorkspaces = await db.select({ id: workspaces.id }).from(workspaces);
  let totalExpired = 0;

  for (const ws of allWorkspaces) {
    const count = await expireOverdueRequests(ws.id);
    totalExpired += count;
  }

  return NextResponse.json({ expired: totalExpired, workspacesProcessed: allWorkspaces.length });
}
