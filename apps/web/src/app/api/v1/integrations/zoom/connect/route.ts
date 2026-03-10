/**
 * Zoom integration configuration endpoint.
 * POST: Enable Zoom integration for workspace (validates credentials)
 * PATCH: Update workspace Zoom settings (e.g., consent_required toggle)
 */
import { NextRequest } from "next/server";
import {
  getAuthContext,
  unauthorized,
  badRequest,
  success,
  requireAdmin,
} from "@/lib/api-utils";
import { db } from "@/db";
import { integrationTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getZoomAccessToken } from "@/services/integrations/zoom";

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const adminCheck = requireAdmin(ctx);
  if (adminCheck) return adminCheck;

  // Validate that Zoom S2S credentials are configured
  const requiredVars = ["ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET", "ZOOM_ACCOUNT_ID", "ZOOM_WEBHOOK_SECRET_TOKEN"];
  const missing = requiredVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    return badRequest(`Missing Zoom environment variables: ${missing.join(", ")}`);
  }

  try {
    // Test credentials by fetching a token
    await getZoomAccessToken();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return badRequest(`Zoom credential validation failed: ${message}`);
  }

  const body = await req.json().catch(() => ({})) as { consentRequired?: boolean };

  // Store Zoom integration as a special token row
  // For S2S OAuth, we don't store user-level tokens — just workspace settings
  await db
    .insert(integrationTokens)
    .values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      provider: "zoom",
      // Use a placeholder token — S2S tokens are fetched dynamically
      accessTokenEncrypted: "zoom_s2s",
      status: "active",
      providerMetadata: {
        zoomEnabled: true,
        consentRequired: body.consentRequired ?? false,
      },
    })
    .onConflictDoUpdate({
      target: [
        integrationTokens.workspaceId,
        integrationTokens.userId,
        integrationTokens.provider,
      ],
      set: {
        status: "active",
        providerMetadata: {
          zoomEnabled: true,
          consentRequired: body.consentRequired ?? false,
        },
        errorMessage: null,
      },
    });

  return success({ enabled: true });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const adminCheck = requireAdmin(ctx);
  if (adminCheck) return adminCheck;

  const body = await req.json() as { consentRequired?: boolean };

  const rows = await db
    .select({ providerMetadata: integrationTokens.providerMetadata })
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.workspaceId, ctx.workspaceId),
        eq(integrationTokens.provider, "zoom")
      )
    )
    .limit(1);

  if (rows.length === 0) {
    return badRequest("Zoom is not connected");
  }

  const meta = (rows[0].providerMetadata ?? {}) as Record<string, unknown>;

  await db
    .update(integrationTokens)
    .set({
      providerMetadata: {
        ...meta,
        consentRequired: body.consentRequired ?? meta.consentRequired,
      },
    })
    .where(
      and(
        eq(integrationTokens.workspaceId, ctx.workspaceId),
        eq(integrationTokens.provider, "zoom")
      )
    );

  return success({ updated: true });
}
