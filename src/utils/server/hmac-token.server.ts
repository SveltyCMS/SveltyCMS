/**
 * @file src/utils/server/hmac-token.server.ts
 * @description Shared HMAC-SHA-256 sign/verify core for short-lived signed
 * tokens in the `${exp}:${base64url}` wire format — the consolidated
 * implementation behind the pending-2FA challenge token and the session-bound
 * reauth token (previously duplicated in pending-2fa-token.server.ts and
 * session-reauth.server.ts).
 *
 * Features:
 * - Identical wire format and TTL predicates to the per-module implementations
 *   it replaces, so in-flight tokens verify unchanged.
 * - Allocation-lean parsing: `indexOf(":")` + `slice` instead of `split(":")`.
 * - `timingSafeEqual` digest comparison; length mismatch is caught → `false`.
 *
 * The HMAC secret is passed in by callers — this module performs no settings
 * I/O, so `getPrivateSettingSync` (an in-memory settings-cache read) remains
 * the single secret source and secret rotation stays visible on the next read.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signs an expiring token. The digest covers
 * `${domain ? `${domain}:` : ""}${parts.join(":")}:${exp}` — an empty `domain`
 * starts the message at `parts[0]` (reauth-style), a non-empty one prefixes it
 * (pending-2FA-style).
 */
export function signHmacToken(
  domain: string,
  parts: string[],
  exp: number,
  secret: string,
): string {
  const message = `${domain ? `${domain}:` : ""}${parts.join(":")}:${exp}`;
  const sig = createHmac("sha256", secret).update(message).digest("base64url");
  return `${exp}:${sig}`;
}

/**
 * Verifies a token produced by {@link signHmacToken} (or the equivalent legacy
 * per-module implementation). Invalid ⇒ `false`, never throws:
 * - falsy / non-string token
 * - not exactly two `:`-separated segments (`exp:sig`)
 * - non-finite `exp`
 * - `exp < now` (expired) or `exp - now > maxTtlMs` (far-future forgery)
 * - empty secret
 * - digest mismatch (timing-safe compare; length mismatch also ⇒ false)
 */
export function verifyHmacToken(
  token: string | null | undefined,
  domain: string,
  parts: string[],
  maxTtlMs: number,
  secret: string,
): boolean {
  if (!token || typeof token !== "string") return false;
  const sep = token.indexOf(":");
  if (sep === -1 || token.indexOf(":", sep + 1) !== -1) return false;
  const exp = Number(token.slice(0, sep));
  const now = Date.now();
  if (!Number.isFinite(exp) || exp < now || exp - now > maxTtlMs) return false;
  if (!secret) return false;
  const message = `${domain ? `${domain}:` : ""}${parts.join(":")}:${exp}`;
  const expected = createHmac("sha256", secret).update(message).digest("base64url");
  try {
    return timingSafeEqual(Buffer.from(token.slice(sep + 1)), Buffer.from(expected));
  } catch {
    return false;
  }
}
