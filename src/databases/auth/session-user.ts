/**
 * @file src/databases/auth/session-user.ts
 * @description Credential-free session user snapshots and session anomaly evaluation.
 *
 * Responsibilities:
 * - Stripping credential material (password hash, TOTP secret, backup codes,
 *   reset tokens, OAuth refresh tokens, trusted-device fingerprints) from user
 *   objects before they enter the L1/L2 session caches or the in-memory/Redis
 *   session store.
 * - Pure evaluation of session anomalies (IP / user-agent drift) and the
 *   risk action that drift produces (log an IP change, step up on a new browser).
 *
 * ### Features:
 * - zero-allocation fast path (returns the original reference when no
 *   sensitive field is present)
 * - defense-in-depth: applied at every session cache/store write boundary
 * - pure anomaly evaluation (no I/O, fully unit-testable)
 */

/** Credential / secret fields that must never ride in session caches or stores. */
export const SESSION_USER_SENSITIVE_FIELDS = [
  "password", // argon2id hash
  "totpSecret", // TOTP seed (encrypted at rest, but never cached)
  "backupCodes", // 2FA recovery codes (hashed, but never cached)
  "resetToken", // password-reset token
  "googleRefreshToken", // OAuth refresh token
  "twoFactorTrustedDevices", // trusted-device fingerprints
] as const;

export type SensitiveUserField = (typeof SESSION_USER_SENSITIVE_FIELDS)[number];

const SENSITIVE_SET = new Set<string>(SESSION_USER_SENSITIVE_FIELDS);

/**
 * Returns a shallow copy of the user with all credential material removed.
 * When the user carries no sensitive fields the ORIGINAL reference is returned
 * — the hot path (session cache hits) stays allocation-free.
 */
export function toSafeSessionUser<T extends object>(user: T): T {
  if (!user || typeof user !== "object") return user;
  let needsCopy = false;
  const userRec = user as Record<string, unknown>;
  for (const field of SESSION_USER_SENSITIVE_FIELDS) {
    if (userRec[field] !== undefined) {
      needsCopy = true;
      break;
    }
  }
  if (!needsCopy) return user;

  // Build clean object without delete operator to preserve V8 fast-mode hidden class
  const safe: Record<string, unknown> = {};
  for (const key in userRec) {
    if (Object.hasOwn(userRec, key) && !SENSITIVE_SET.has(key)) {
      safe[key] = userRec[key];
    }
  }
  return safe as T;
}

/**
 * Detects session context drift (IP or user-agent change) between the stored
 * session record and the current request. Values are normalized (trimmed,
 * lower-cased) and only a non-empty stored value triggers a comparison, so
 * sessions created before device capture simply never flag.
 */
export function evaluateSessionAnomaly(options: {
  currentIp?: string | null;
  currentUserAgent?: string | null;
  storedIp?: string | null;
  storedUserAgent?: string | null;
}): { ipChanged: boolean; userAgentChanged: boolean } {
  const { currentIp, currentUserAgent, storedIp, storedUserAgent } = options;

  let ipChanged = false;
  if (storedIp && currentIp) {
    const sIp = storedIp.trim().toLowerCase();
    const cIp = currentIp.trim().toLowerCase();
    ipChanged = sIp.length > 0 && cIp.length > 0 && sIp !== cIp;
  }

  let userAgentChanged = false;
  if (storedUserAgent && currentUserAgent) {
    const sUa = storedUserAgent.trim().toLowerCase();
    const cUa = currentUserAgent.trim().toLowerCase();
    userAgentChanged = sUa.length > 0 && cUa.length > 0 && sUa !== cUa;
  }

  return { ipChanged, userAgentChanged };
}

/**
 * What the session layer does with a drift result.
 *
 * A user-agent change is a different browser on a live session, so mutations
 * require a fresh sign-in. An IP change alone is logged: mobile networks and
 * CGNAT rotate addresses without a new browser. Empty stored values stay
 * `allow` so sessions created before device capture are not challenged.
 */
export type SessionRiskAction = "allow" | "log" | "step-up";

export function decideSessionRisk(drift: {
  ipChanged: boolean;
  userAgentChanged: boolean;
}): SessionRiskAction {
  if (drift.userAgentChanged) return "step-up";
  if (drift.ipChanged) return "log";
  return "allow";
}

/**
 * Authentication Methods References (RFC 8176) evaluation helpers.
 *
 * Supported AMR identifiers:
 * - "pwd": Username & password authentication
 * - "mfa": Interactive multi-factor authentication (e.g., TOTP or backup code)
 * - "webauthn": Hardware-backed passkey or FIDO2 key
 * - "trusted_device": Device-token trust bypass
 */
export interface SessionAuthContext {
  amr?: string[];
  mfaVerifiedAt?: string;
}

/**
 * Returns true if the session carries an interactive second factor
 * ("mfa" or "webauthn"). Note: "trusted_device" alone is not interactive MFA.
 */
export function isSessionMfaActive(
  sessionOrAmr?: SessionAuthContext | string[] | null,
  maxAgeMs?: number,
): boolean {
  if (!sessionOrAmr) return false;

  let amr: string[] | undefined;
  let mfaVerifiedAt: string | undefined;

  if (Array.isArray(sessionOrAmr)) {
    amr = sessionOrAmr;
  } else {
    amr = sessionOrAmr.amr;
    mfaVerifiedAt = sessionOrAmr.mfaVerifiedAt;
  }

  if (!amr || (!amr.includes("mfa") && !amr.includes("webauthn"))) {
    return false;
  }

  // If a max age was specified, verify freshness of mfaVerifiedAt
  if (maxAgeMs && maxAgeMs > 0 && mfaVerifiedAt) {
    const verifiedTime = new Date(mfaVerifiedAt).getTime();
    if (Number.isNaN(verifiedTime) || Date.now() - verifiedTime > maxAgeMs) {
      return false;
    }
  }

  return true;
}

/**
 * Derives default AMR array for a newly authenticated session.
 */
export function deriveSessionAmr(options: {
  isMfaVerified?: boolean;
  usedTrustedDevice?: boolean;
}): string[] {
  const amr: string[] = ["pwd"];
  if (options.isMfaVerified) {
    amr.push("mfa");
  } else if (options.usedTrustedDevice) {
    amr.push("trusted_device");
  }
  return amr;
}
