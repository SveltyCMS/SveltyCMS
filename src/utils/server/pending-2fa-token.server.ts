/**
 * @file src/utils/server/pending-2fa-token.server.ts
 * @description Short-lived signed token that chains a TOTP challenge to a PRIOR
 * password login (prevents passwordless 2FA brute-force).
 *
 * 🛡️ HARDENING: `verify2FA` previously accepted (userId, code) with no password
 * proof — anyone who knew a user id could brute-force a 6-digit TOTP. The login
 * flow now issues a signed, expiring token on the requires2FA branch; the TOTP
 * code is only accepted together with that token.
 *
 * The HMAC sign/verify core lives in hmac-token.server.ts (shared with
 * session-reauth.server.ts); this module contributes its token domain
 * (`pending2fa`) and secret source (settings first, `JWT_SECRET_KEY` env
 * fallback).
 */

import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { signHmacToken, verifyHmacToken } from "@utils/server/hmac-token.server";

export const PENDING_2FA_TTL_MS = 5 * 60 * 1000; // 5 minutes

function pending2faSecret(): string {
  const secret = getPrivateSettingSync("JWT_SECRET_KEY");
  return String(secret || process.env.JWT_SECRET_KEY || "");
}

export function signPending2faToken(userId: string): string {
  const exp = Date.now() + PENDING_2FA_TTL_MS;
  return signHmacToken("pending2fa", [userId], exp, pending2faSecret());
}

export function verifyPending2faToken(token: string | null | undefined, userId: string): boolean {
  return verifyHmacToken(token, "pending2fa", [userId], PENDING_2FA_TTL_MS, pending2faSecret());
}
