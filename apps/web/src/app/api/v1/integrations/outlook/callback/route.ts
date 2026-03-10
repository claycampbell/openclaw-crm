import { NextRequest, NextResponse } from "next/server";
import { handleCallback } from "@/services/integrations/outlook";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?error=missing_code_or_state`
    );
  }

  try {
    await handleCallback(code, state);
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?connected=Outlook`
    );
  } catch (err) {
    console.error("[outlook/callback]", err);
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?error=oauth_failed`
    );
  }
}
