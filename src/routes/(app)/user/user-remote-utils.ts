/**
 * @file src/routes/(app)/user/user-remote-utils.ts
 * @description Pure helpers for user remote functions (testable without $app/server).
 *
 * ### Features:
 * - buildUpdateProfileBody — splits user_id from attribute payload
 * - remoteJsonHeaders — JSON + optional CSRF from request cookies
 */

import type { Cookies } from "@sveltejs/kit";
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
