/**
 * Cursor-based pagination using composite cursors (createdAt + id).
 * Handles sort column ties per Pitfall 13 from research.
 *
 * The composite cursor ensures stable ordering even when multiple records
 * share the same createdAt timestamp, by using the record UUID as a tiebreaker.
 */

export interface CursorData {
  createdAt: string; // ISO timestamp
  id: string; // record UUID
}

export function encodeCursor(data: CursorData): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

export function decodeCursor(cursor: string): CursorData | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    );
    if (
      typeof parsed.createdAt === "string" &&
      typeof parsed.id === "string"
    ) {
      return parsed as CursorData;
    }
    return null;
  } catch {
    return null;
  }
}
