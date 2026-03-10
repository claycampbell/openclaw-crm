/**
 * OAuth token storage with AES-256-GCM encryption.
 * Tokens are encrypted at rest using ENCRYPTION_KEY env var.
 * Provides proactive refresh 5 minutes before expiry.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { db } from "@/db";
import { integrationTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createNotification } from "@/services/notifications";

type Provider = "gmail" | "outlook" | "google_calendar" | "outlook_calendar" | "zoom" | "linkedin";
type Status = "active" | "revoked" | "error" | "expired";

// ─── Encryption ──────────────────────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "[token-manager] ENCRYPTION_KEY env var is not set. " +
        "Generate one with: openssl rand -hex 32"
    );
  }
  return Buffer.from(key, "hex");
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Output format: `{iv_hex}:{authTag_hex}:{ciphertext_hex}`
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Decrypt a token that was encrypted by encryptToken().
 */
export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("[token-manager] Invalid encrypted token format");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// ─── Token Storage ────────────────────────────────────────────────────────────

export interface StoreTokenInput {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
  providerMetadata?: Record<string, unknown>;
}

/**
 * Store (upsert) OAuth tokens for a user+provider combination.
 * Both tokens are encrypted before writing to the database.
 */
export async function storeToken(
  workspaceId: string,
  userId: string,
  provider: Provider,
  input: StoreTokenInput
): Promise<void> {
  const accessTokenEncrypted = encryptToken(input.accessToken);
  const refreshTokenEncrypted = input.refreshToken
    ? encryptToken(input.refreshToken)
    : null;

  await db
    .insert(integrationTokens)
    .values({
      workspaceId,
      userId,
      provider,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      expiresAt: input.expiresAt ?? null,
      scopes: input.scopes ?? [],
      status: "active",
      providerMetadata: input.providerMetadata ?? {},
      connectedAt: new Date(),
      errorMessage: null,
    })
    .onConflictDoUpdate({
      target: [
        integrationTokens.workspaceId,
        integrationTokens.userId,
        integrationTokens.provider,
      ],
      set: {
        accessTokenEncrypted,
        refreshTokenEncrypted,
        expiresAt: input.expiresAt ?? null,
        scopes: input.scopes ?? [],
        status: "active",
        providerMetadata: input.providerMetadata ?? {},
        lastRefreshedAt: new Date(),
        errorMessage: null,
      },
    });
}

// ─── Token Retrieval ──────────────────────────────────────────────────────────

export interface ValidToken {
  accessToken: string;
  refreshToken?: string;
  tokenRow: typeof integrationTokens.$inferSelect;
}

/**
 * Get a valid (non-expired) access token for a user+provider.
 * Proactively refreshes if the token expires within 5 minutes.
 * Returns null if no token exists, token is revoked, or refresh fails.
 */
export async function getValidToken(
  workspaceId: string,
  userId: string,
  provider: Provider
): Promise<ValidToken | null> {
  const rows = await db
    .select()
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.workspaceId, workspaceId),
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, provider)
      )
    )
    .limit(1);

  if (rows.length === 0) return null;

  const tokenRow = rows[0];

  if (tokenRow.status !== "active") {
    return null;
  }

  // Proactive refresh: if token expires within 5 minutes, refresh now
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  if (tokenRow.expiresAt && tokenRow.expiresAt < fiveMinutesFromNow) {
    try {
      const newAccessToken = await refreshTokenIfNeeded(tokenRow);
      const refreshToken = tokenRow.refreshTokenEncrypted
        ? decryptToken(tokenRow.refreshTokenEncrypted)
        : undefined;
      return { accessToken: newAccessToken, refreshToken, tokenRow };
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes("invalid_grant")) {
        // Token has been revoked externally — mark as revoked and notify
        await db
          .update(integrationTokens)
          .set({ status: "revoked", errorMessage: "Token revoked (invalid_grant)" })
          .where(eq(integrationTokens.id, tokenRow.id));

        // Create in-app notification for the user
        await createNotification({
          workspaceId,
          userId,
          type: "integration_revoked",
          title: `${provider} connection expired`,
          body: `Your ${provider} integration was disconnected. Please reconnect in Settings > Integrations.`,
          url: "/settings/integrations",
        }).catch(() => {}); // don't let notification failure block

        return null;
      }
      // Non-fatal refresh error — log and return existing token if not yet expired
      console.error(`[token-manager] Refresh failed for ${provider}:`, err);
      if (tokenRow.expiresAt && tokenRow.expiresAt > new Date()) {
        const accessToken = decryptToken(tokenRow.accessTokenEncrypted);
        const refreshToken = tokenRow.refreshTokenEncrypted
          ? decryptToken(tokenRow.refreshTokenEncrypted)
          : undefined;
        return { accessToken, refreshToken, tokenRow };
      }
      return null;
    }
  }

  const accessToken = decryptToken(tokenRow.accessTokenEncrypted);
  const refreshToken = tokenRow.refreshTokenEncrypted
    ? decryptToken(tokenRow.refreshTokenEncrypted)
    : undefined;

  return { accessToken, refreshToken, tokenRow };
}

// ─── Token Refresh ────────────────────────────────────────────────────────────

/**
 * Refresh an access token using the stored refresh token.
 * Updates the database with the new access token and expiry.
 * Throws if the refresh fails (including invalid_grant).
 */
export async function refreshTokenIfNeeded(
  tokenRow: typeof integrationTokens.$inferSelect
): Promise<string> {
  if (!tokenRow.refreshTokenEncrypted) {
    throw new Error(`[token-manager] No refresh token stored for ${tokenRow.provider}`);
  }

  const refreshToken = decryptToken(tokenRow.refreshTokenEncrypted);
  const provider = tokenRow.provider;

  let tokenEndpoint: string;
  let extraBody: Record<string, string> = {};

  if (provider === "gmail" || provider === "google_calendar") {
    tokenEndpoint = "https://oauth2.googleapis.com/token";
    extraBody = {
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    };
  } else if (provider === "outlook" || provider === "outlook_calendar") {
    tokenEndpoint = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    extraBody = {
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    };
  } else {
    throw new Error(`[token-manager] No refresh logic for provider: ${provider}`);
  }

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      ...extraBody,
    }),
  });

  const data = await response.json() as Record<string, unknown>;

  if (!response.ok || data.error) {
    const errCode = data.error as string | undefined;
    const errMsg = data.error_description as string | undefined;
    throw new Error(
      `${errCode ?? "refresh_failed"}: ${errMsg ?? "Unknown error"}`
    );
  }

  const newAccessToken = data.access_token as string;
  const expiresIn = data.expires_in as number | undefined;
  const expiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : null;

  // Update stored token
  await db
    .update(integrationTokens)
    .set({
      accessTokenEncrypted: encryptToken(newAccessToken),
      expiresAt,
      lastRefreshedAt: new Date(),
      status: "active",
      errorMessage: null,
    })
    .where(eq(integrationTokens.id, tokenRow.id));

  return newAccessToken;
}

// ─── Revocation ───────────────────────────────────────────────────────────────

/**
 * Revoke an integration token and call the provider's revocation endpoint.
 */
export async function revokeToken(
  workspaceId: string,
  userId: string,
  provider: Provider
): Promise<void> {
  const rows = await db
    .select()
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.workspaceId, workspaceId),
        eq(integrationTokens.userId, userId),
        eq(integrationTokens.provider, provider)
      )
    )
    .limit(1);

  if (rows.length === 0) return;

  const tokenRow = rows[0];

  // Mark as revoked first so any in-flight requests fail cleanly
  await db
    .update(integrationTokens)
    .set({ status: "revoked" })
    .where(eq(integrationTokens.id, tokenRow.id));

  // Best-effort: call provider revocation endpoint
  try {
    if (provider === "gmail" || provider === "google_calendar") {
      const accessToken = decryptToken(tokenRow.accessTokenEncrypted);
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`,
        { method: "POST" }
      );
    } else if (provider === "outlook" || provider === "outlook_calendar") {
      // Microsoft doesn't have a simple revoke endpoint — token just expires
    }
  } catch {
    // Best effort — don't throw if revocation endpoint fails
  }
}

// ─── Connection Status ────────────────────────────────────────────────────────

export type ConnectionStatus = Record<Provider, Status | null>;

/**
 * Get connection status for all providers for a user in a workspace.
 * Returns null for providers that have never been connected.
 */
export async function getConnectionStatus(
  workspaceId: string,
  userId: string
): Promise<ConnectionStatus> {
  const rows = await db
    .select({
      provider: integrationTokens.provider,
      status: integrationTokens.status,
    })
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.workspaceId, workspaceId),
        eq(integrationTokens.userId, userId)
      )
    );

  const result: ConnectionStatus = {
    gmail: null,
    outlook: null,
    google_calendar: null,
    outlook_calendar: null,
    zoom: null,
    linkedin: null,
  };

  for (const row of rows) {
    result[row.provider] = row.status;
  }

  return result;
}
