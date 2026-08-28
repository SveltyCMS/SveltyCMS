/**
 * @file src/utils/server/pending-2fa-token.server.ts
 * @description Short-lived signed token that chains a TOTP challenge to a PRIOR
 * password login (prevents passwordless 2FA brute-force).
 *
 * 🛡️ HARDENING: `verify2FA` previously accepted (userId, code) with no password
 * proof — anyone who knew a user id could brute-force a 6-digit TOTP. The login
 * flow now issues a signed, expiring token on the requires2FA branch; the TOTP
 * code is only accepted together with that token.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getPrivateSettingSync } from "@src/services/core/settings-service";

export const PENDING_2FA_TTL_MS = 5 * 60 * 1000; // 5 minutes

function pending2faSecret(): string {
  const secret = getPrivateSettingSync("JWT_SECRET_KEY");
  return String(secret || process.env.JWT_SECRET_KEY || "");
}

export function signPending2faToken(userId: string): string {
  const exp = Date.now() + PENDING_2FA_TTL_MS;
  const sig = createHmac("sha256", pending2faSecret())
    .update(`pending2fa:${userId}:${exp}`)
    .digest("base64url");
  return `${exp}:${sig}`;
}

export function verifyPending2faToken(token: string | null | undefined, userId: string): boolean {
  if (!token) return false;
  const parts = token.split(":");
  if (parts.length !== 2) return false;
  const exp = Number(parts[0]);
  if (!Number.isFinite(exp) || exp < Date.now() || exp - Date.now() > PENDING_2FA_TTL_MS) {
    return false;
  }
  const secret = pending2faSecret();
  if (!secret) return false;
  const expected = createHmac("sha256", secret)
    .update(`pending2fa:${userId}:${exp}`)
    .digest("base64url");
  try {
    return timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expected));
  } catch {
    return false;
  }
}
