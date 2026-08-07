/**
 * @file src/utils/security/user-attribute-policy.ts
 * @description
 * Privilege-boundary policy for user attribute updates.
 *
 * Prevents authenticated low-privileged callers from escalating privileges
 * (role / isAdmin / permissions) or rewriting security-sensitive account state
 * via profile update endpoints such as POST /api/auth/update-user-attributes
 * and PUT/PATCH /api/user/:id.
 *
 * ### Layers
 * 1. **API handlers** — strip the full privileged denylist for non-admin callers
 * 2. **Adapters / Auth facade** — fail-closed strip of escalation fields unless
 *    `allowPrivilegeEscalation: true` (admin / system / testing seed only)
 *
 * ### Features:
 * - privilege-escalation denylist (role, isAdmin, roleIds, permissions)
 * - full privileged denylist for client-facing profile APIs
 * - pure helpers suitable for unit tests and static scanners
 */

/** Fields that grant administrator / RBAC power — fail-closed at every write path. */
export const PRIVILEGE_ESCALATION_FIELDS = ["role", "isAdmin", "roleIds", "permissions"] as const;

export type PrivilegeEscalationField = (typeof PRIVILEGE_ESCALATION_FIELDS)[number];

/**
 * Fields that grant or change privilege / security posture — never client-writable
 * without admin. Broader than escalation (includes lockout, 2FA secrets, identity).
 */
export const PRIVILEGED_USER_FIELDS = [
  ...PRIVILEGE_ESCALATION_FIELDS,
  "blocked",
  "failedAttempts",
  "lockoutUntil",
  "emailVerified",
  "totpSecret",
  "backupCodes",
  "is2FAEnabled",
  "twoFactorPending",
  "twoFactorTrustedDevices",
  "authenticators",
  "resetToken",
  "resetRequestedAt",
  "expiresAt",
  "samlId",
  "samlProvider",
  "googleRefreshToken",
  "tenantId",
  "_id",
  "id",
  "passwordHash",
  "createdAt",
  "updatedAt",
  "activeSessions",
  "lastAccess",
  "lastActiveAt",
  "lastAuthMethod",
  "last2FAVerification",
  "isRegistered",
] as const;

export type PrivilegedUserField = (typeof PRIVILEGED_USER_FIELDS)[number];

const ESCALATION_SET = new Set<string>(PRIVILEGE_ESCALATION_FIELDS);
const PRIVILEGED_SET = new Set<string>(PRIVILEGED_USER_FIELDS);

function stripKeys<T extends Record<string, unknown>>(updates: T, keys: Set<string>): T {
  for (const key of Object.keys(updates)) {
    if (keys.has(key)) {
      delete updates[key];
    }
  }
  return updates;
}

/**
 * Remove privilege-escalation fields only (role / isAdmin / roleIds / permissions).
 * Used as the adapter-level fail-closed default so lockout/2FA internal updates still work.
 */
export function stripPrivilegeEscalationFields<T extends Record<string, unknown>>(updates: T): T {
  return stripKeys(updates, ESCALATION_SET);
}

/**
 * Remove privilege / security fields from a client-supplied attribute patch.
 * Mutates and returns the same object for call-site convenience.
 */
export function stripPrivilegedUserFields<T extends Record<string, unknown>>(updates: T): T {
  return stripKeys(updates, PRIVILEGED_SET);
}

/** True if any key is a privilege-escalation field (before stripping). */
export function hasPrivilegeEscalationFields(updates: Record<string, unknown>): boolean {
  return Object.keys(updates).some((k) => ESCALATION_SET.has(k));
}

/** True if any key in the patch is a privileged field (before stripping). */
export function hasPrivilegedUserFields(updates: Record<string, unknown>): boolean {
  return Object.keys(updates).some((k) => PRIVILEGED_SET.has(k));
}

/** Caller is a system/super admin for attribute-update purposes. */
export function isAdminCaller(
  caller:
    | {
        isAdmin?: boolean;
        role?: string;
      }
    | null
    | undefined,
): boolean {
  if (!caller) return false;
  return caller.isAdmin === true || caller.role === "admin" || caller.role === "super-admin";
}

/**
 * Sanitize a client JSON body for user attribute updates.
 * - Always drops password verification-only / identity rewrite keys
 * - Non-admin: full privileged denylist
 * - Admin: keeps role/isAdmin (caller must pass allowPrivilegeEscalation to the DB layer)
 */
export function sanitizeClientUserAttributePatch(
  raw: Record<string, unknown>,
  options: { isAdmin: boolean },
): Record<string, unknown> {
  const updates = { ...raw };
  // Never accept identity rewrite or password confirmation noise
  delete updates.user_id;
  delete updates.currentPassword;
  delete updates.confirmPassword;
  delete updates._id;
  delete updates.id;

  if ("password" in updates && (!updates.password || String(updates.password).trim() === "")) {
    delete updates.password;
  }

  if (!options.isAdmin) {
    stripPrivilegedUserFields(updates);
  }

  return updates;
}
