/**
 * @file src/utils/server/session-reauth.server.ts
 * @description Session-bound password proof for cross-session revoke (Laravel-style).
 *
 * The HMAC sign/verify core lives in hmac-token.server.ts (shared with
 * pending-2fa-token.server.ts); this module contributes its empty token domain
 * (the digest message is `${userId}:${sessionId}:${exp}`) and its secret source
 * (settings only — no env fallback).
 */

import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { signHmacToken, verifyHmacToken } from "@utils/server/hmac-token.server";

export const REAUTH_TOKEN_TTL_MS = 5 * 60 * 1000;

export function signReauthToken(userId: string, sessionId: string, exp: number): string {
  const secret = String(getPrivateSettingSync("JWT_SECRET_KEY") || "");
  return signHmacToken("", [userId, sessionId], exp, secret);
}

export function verifyReauthToken(
  token: string | null | undefined,
  userId: string,
  sessionId: string,
): boolean {
  const secret = String(getPrivateSettingSync("JWT_SECRET_KEY") || "");
  return verifyHmacToken(token, "", [userId, sessionId], REAUTH_TOKEN_TTL_MS, secret);
}
