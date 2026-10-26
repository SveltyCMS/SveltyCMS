/**
 * @file src/routes/(app)/user/user-remote-utils.ts
 * @description Pure helpers for user remote functions (testable without $app/server).
 *
 * ### Features:
 * - buildUpdateProfileBody — splits user_id from attribute payload
 * - remoteJsonHeaders — JSON + optional CSRF from request cookies
 * - mapActiveSessions — one session view-model shared by the remote query and the SSR load
 * - sanitizeUserTableRow — admin-table row without credentials/lockout state
 * - convertDateToExpiresFormat / convertLegacyExpiresFormat / convertExpiresToHours — shared token validity helpers
 */

import type { Cookies } from "@sveltejs/kit";
import { SESSION_USER_SENSITIVE_FIELDS } from "@src/databases/auth/session-user";
import { CSRF_TOKEN_COOKIE_NAME, CSRF_TOKEN_HEADER } from "@utils/security/csrf-utils";

/**
 * Split remote profile payload into API shape expected by update-user-attributes.
 * Keeps user_id out of newUserData.
 */
export function buildUpdateProfileBody(data: Record<string, unknown>): {
  user_id: string;
  newUserData: Record<string, unknown>;
} {
  const { user_id: rawId, ...rest } = data;
  const user_id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId : "self";
  return { user_id, newUserData: rest };
}

/**
 * Build JSON headers with CSRF token from cookies when present.
 */
export function remoteJsonHeaders(cookies: Pick<Cookies, "get">): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const secureName = `__Host-${CSRF_TOKEN_COOKIE_NAME}`;
  const csrf = cookies.get(secureName) || cookies.get(CSRF_TOKEN_COOKIE_NAME) || null;
  if (csrf) {
    headers[CSRF_TOKEN_HEADER] = csrf;
  }
  return headers;
}

/** Session row as rendered by the Security tab (legacy field aliases resolved). */
export interface ActiveSessionRow {
  [key: string]: unknown;
  _id: string;
  id: string;
  isCurrent: boolean;
}

/**
 * Normalize raw adapter sessions for the Security tab: drop rotated sessions,
 * resolve legacy field aliases, and flag at most one current session.
 *
 * Shared by `getActiveSessions` (client refresh) and `+page.server.ts` (first
 * paint) so both produce byte-identical rows.
 */
export function mapActiveSessions(raw: unknown, currentSessionId: string): ActiveSessionRow[] {
  const rows = (Array.isArray(raw) ? raw : []) as Record<string, unknown>[];
  const sessions: ActiveSessionRow[] = rows
    .filter((s) => !s.rotated)
    .map((s) => {
      const sid = String(s._id ?? s.id ?? "");
      return {
        ...s,
        _id: sid,
        id: sid,
        ip: s.ip ?? s.ipAddress,
        ipAddress: s.ipAddress ?? s.ip,
        lastAccess: s.lastAccess ?? s.lastActiveAt ?? s.updatedAt ?? s.createdAt,
        lastActiveAt: s.lastActiveAt ?? s.updatedAt ?? s.createdAt,
        userAgent: s.userAgent ?? "",
        isCurrent: currentSessionId.length > 0 && sid === currentSessionId,
      };
    });
  // Never render two "current" badges
  let sawCurrent = false;
  for (const s of sessions) {
    if (s.isCurrent) {
      if (sawCurrent) s.isCurrent = false;
      else sawCurrent = true;
    }
  }
  return sessions;
}

/** Admin-table user row: identifiers stringified, secrets stripped. */
export interface UserTableRow {
  [key: string]: unknown;
  _id: string;
}

/** Never sent to the client from the admin table (see `SESSION_USER_SENSITIVE_FIELDS`). */
const ADMIN_TABLE_HIDDEN_FIELDS = new Set<string>([
  ...SESSION_USER_SENSITIVE_FIELDS,
  "failedAttempts",
  "lockoutUntil",
]);

/**
 * Strip credential material and lockout state from a user record before it
 * reaches the client. Uses the canonical session sensitive-field list
 * (`password`, TOTP seed, backup codes, reset/OAuth tokens, trusted devices)
 * plus the two lockout fields the `/api/user` list handler also drops.
 */
export function sanitizeUserTableRow(value: unknown): UserTableRow | null {
  if (!value || typeof value !== "object") return null;
  const safe: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
    if (!ADMIN_TABLE_HIDDEN_FIELDS.has(key)) safe[key] = field;
  }
  return { ...safe, _id: safe._id != null ? String(safe._id) : "" };
}

/** Valid token expiration labels accepted by `addUserTokenSchema` and `ModalEditToken`. */
export const VALID_TOKEN_EXPIRES_LABELS = [
  "2 hrs",
  "12 hrs",
  "2 days",
  "1 week",
  "2 weeks",
  "1 month",
] as const;

export type TokenExpiresLabel = (typeof VALID_TOKEN_EXPIRES_LABELS)[number];

const VALID_EXPIRES_SET = new Set<string>(VALID_TOKEN_EXPIRES_LABELS);

/**
 * Convert legacy short-form expiration strings (`1h`, `2d`, `7d`, `30d`, …)
 * into the canonical `ModalEditToken` / `addUserTokenSchema` label.
 */
export function convertLegacyExpiresFormat(expires: string): TokenExpiresLabel {
  switch (expires) {
    case "1h":
    case "2h":
      return "2 hrs";
    case "12h":
      return "12 hrs";
    case "1d":
    case "2d":
      return "2 days";
    case "7d":
      return "1 week";
    case "14d":
      return "2 weeks";
    case "30d":
    case "90d":
      return "1 month";
    default:
      if (VALID_EXPIRES_SET.has(expires)) {
        return expires as TokenExpiresLabel;
      }
      return "2 days";
  }
}

/**
 * Convert a `TokenExpiresLabel` into hours for ISO expiration timestamp calculation.
 */
export function convertExpiresToHours(expires: string): number {
  switch (expires) {
    case "2 hrs":
      return 2;
    case "12 hrs":
      return 12;
    case "2 days":
      return 48;
    case "1 week":
      return 168;
    case "2 weeks":
      return 336;
    case "1 month":
      return 720;
    default:
      return 48;
  }
}

/**
 * Convert a Date or ISO date string into the closest `TokenExpiresLabel`
 * expected by `ModalEditToken`.
 */
export function convertDateToExpiresFormat(
  expiresDate: Date | string | null | undefined,
  nowMs: number = Date.now(),
): TokenExpiresLabel {
  if (!expiresDate) {
    return "2 days";
  }
  const expiresMs =
    expiresDate instanceof Date ? expiresDate.getTime() : new Date(expiresDate).getTime();
  if (!Number.isFinite(expiresMs)) {
    return "2 days";
  }
  const diffMs = expiresMs - nowMs;
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  const diffDays = Math.ceil(diffHours / 24);

  if (diffHours <= 2) return "2 hrs";
  if (diffHours <= 12) return "12 hrs";
  if (diffDays <= 2) return "2 days";
  if (diffDays <= 7) return "1 week";
  if (diffDays <= 14) return "2 weeks";
  return "1 month";
}
