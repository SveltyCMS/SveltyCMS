/**
 * @file src/plugins/unified-data-hub/server/federated-cursor.ts
 * @description v3.0 stable — per-source opaque cursor pagination (single-source reads).
 *
 * Global offset pagination cannot span connectors. Each virtual collection read uses an
 * opaque cursor bound to slug + connectorId. Cross-source plans remain plan-only.
 *
 * Features:
 * - base64url-encoded cursor payloads (versioned)
 * - Cursor/slug/connector tamper rejection
 * - nextCursor emission when more rows are available
 */

import { FederationError } from "../types";

export const CURSOR_VERSION = 1;

export interface SourceCursorPayload {
  v: number;
  slug: string;
  connectorId: string;
  offset: number;
}

export function encodeSourceCursor(args: {
  slug: string;
  connectorId: string;
  offset: number;
}): string {
  const payload: SourceCursorPayload = {
    v: CURSOR_VERSION,
    slug: args.slug,
    connectorId: String(args.connectorId),
    offset: Math.max(0, args.offset),
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeSourceCursor(cursor: string, slug: string, connectorId: string): number {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as SourceCursorPayload;
    if (parsed.v !== CURSOR_VERSION) {
      throw new FederationError("CONNECTOR_CAPABILITY_EXCEEDED", "Unsupported cursor version", 400);
    }
    if (parsed.slug !== slug || String(parsed.connectorId) !== String(connectorId)) {
      throw new FederationError(
        "CONNECTOR_CAPABILITY_EXCEEDED",
        "Cursor does not match this virtual collection",
        400,
      );
    }
    return Math.max(0, Number(parsed.offset) || 0);
  } catch (err) {
    if (err instanceof FederationError) throw err;
    throw new FederationError("CONNECTOR_CAPABILITY_EXCEEDED", "Invalid federation cursor", 400);
  }
}

export function resolveCursorOffset(
  options: { cursor?: string; offset?: number },
  slug: string,
  connectorId: string,
): number {
  if (options.cursor) {
    return decodeSourceCursor(options.cursor, slug, connectorId);
  }
  return Math.max(0, options.offset ?? 0);
}

export function buildNextCursor(args: {
  slug: string;
  connectorId: string;
  currentOffset: number;
  rowCount: number;
  total?: number;
  limit: number;
}): string | undefined {
  const nextOffset = args.currentOffset + args.rowCount;
  const hasMore = args.total !== undefined ? nextOffset < args.total : args.rowCount >= args.limit;
  if (!hasMore || args.rowCount === 0) return undefined;
  return encodeSourceCursor({
    slug: args.slug,
    connectorId: args.connectorId,
    offset: nextOffset,
  });
}
