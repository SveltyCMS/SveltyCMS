/**
 * @file src/utils/server/session-reauth.server.ts
 * @description Session-bound password proof for cross-session revoke (Laravel-style).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getPrivateSettingSync } from "@src/services/core/settings-service";

export const REAUTH_TOKEN_TTL_MS = 5 * 60 * 1000;

export function signReauthToken(userId: string, sessionId: string, exp: number): string {
  const secret = String(getPrivateSettingSync("JWT_SECRET_KEY") || "");
  const sig = createHmac("sha256", secret)
    .update(`${userId}:${sessionId}:${exp}`)
    .digest("base64url");
  return `${exp}:${sig}`;
}

export function verifyReauthToken(
  token: string | null | undefined,
  userId: string,
  sessionId: string,
): boolean {
  if (!token) return false;
  const parts = token.split(":");
  if (parts.length !== 2) return false;
  const exp = Number(parts[0]);
  if (!Number.isFinite(exp) || exp - Date.now() > REAUTH_TOKEN_TTL_MS || exp < Date.now()) {
    return false;
  }
  const secret = String(getPrivateSettingSync("JWT_SECRET_KEY") || "");
  if (!secret) return false;
  const expected = createHmac("sha256", secret)
    .update(`${userId}:${sessionId}:${exp}`)
    .digest("base64url");
  try {
    return timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expected));
  } catch {
    return false;
  }
}
