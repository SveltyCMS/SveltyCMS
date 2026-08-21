/**
 * @file src/databases/auth/session-user.ts
 * @description Credential-free session user snapshots and session anomaly evaluation.
 *
 * Responsibilities:
 * - Stripping credential material (password hash, TOTP secret, backup codes,
 *   reset tokens, OAuth refresh tokens, trusted-device fingerprints) from user
 *   objects before they enter the L1/L2 session caches or the in-memory/Redis
 *   session store.
 * - Pure evaluation of session anomalies (IP / user-agent drift) for log-only
 *   OWASP-style detection.
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
  const normalize = (value?: string | null): string => (value ? value.trim().toLowerCase() : "");

  const storedIpNorm = normalize(storedIp);
  const currentIpNorm = normalize(currentIp);
  const storedUaNorm = normalize(storedUserAgent);
  const currentUaNorm = normalize(currentUserAgent);

  return {
    ipChanged:
      storedIpNorm.length > 0 && currentIpNorm.length > 0 && currentIpNorm !== storedIpNorm,
    userAgentChanged:
      storedUaNorm.length > 0 && currentUaNorm.length > 0 && currentUaNorm !== storedUaNorm,
  };
}
