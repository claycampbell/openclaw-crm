import { NextRequest, NextResponse } from "next/server";
import { processJobs } from "@/services/job-queue";

export const runtime = "nodejs"; // Required: FOR UPDATE SKIP LOCKED needs a persistent connection

export async function GET(req: NextRequest) {
  // Validate cron secret to prevent unauthorized triggers
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const processed = await processJobs(10);
  return NextResponse.json({ processed, timestamp: new Date().toISOString() });
}
