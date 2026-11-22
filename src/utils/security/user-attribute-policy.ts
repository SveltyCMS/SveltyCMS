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
 * - privilege-escalation denylist (role, roles, isAdmin, roleIds, permissions)
 * - full privileged denylist for client-facing profile APIs
 * - pure helpers suitable for unit tests and static scanners
 */

import { isAdmin } from "@src/databases/auth/constants";

/** Fields that grant administrator / RBAC power — fail-closed at every write path. */
export const PRIVILEGE_ESCALATION_FIELDS = [
  "role",
  "roles",
  "isAdmin",
  "roleIds",
  "permissions",
] as const;

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

/**
 * Keys that can rewrite the prototype chain when a client body is spread/assigned
 * downstream (`{...body}`, `Object.assign`, a Mongo driver merge). `JSON.parse`
 * creates `__proto__` as an own property, so it survives the spread and only
 * pollutes when a consumer assigns it — the guard has to run on the parsed body.
 */
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Mongo-style operators (`$set`, `$unset`, `$rename`, `$where`) must never arrive
 * from a user attribute patch: the MongoDB adapter hands the patch to the driver,
 * where a `$`-prefixed key is an instruction, not data.
 */
function isUnsafeKey(key: string): boolean {
  return UNSAFE_OBJECT_KEYS.has(key) || key.startsWith("$");
}

/**
 * Identity and audit columns are server-owned. They are dropped for **every**
 * caller (admin included) — a tenant placement is an explicit option on the write
 * (`createUser(..., { tenantId })`), never a body field, so a tenant-scoped admin
 * cannot move a record (or a user) into another tenant through the patch body.
 */
const SERVER_OWNED_FIELDS = ["_id", "id", "tenantId", "createdAt", "updatedAt"] as const;

/** Depth cap for the recursive guard — beyond it the value is dropped (fail-closed). */
const MAX_SANITIZE_DEPTH = 8;

/**
 * Recursively drop prototype-pollution keys and `$` operators at any depth.
 * Mutates in place; arrays are walked because `[{ $set: … }]` reaches the driver too.
 */
function stripUnsafeKeysDeep(node: unknown, depth = 0): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) stripUnsafeKeysDeep(item, depth + 1);
    return;
  }
  const record = node as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (depth >= MAX_SANITIZE_DEPTH || isUnsafeKey(key)) {
      delete record[key];
      continue;
    }
    stripUnsafeKeysDeep(record[key], depth + 1);
  }
}

function stripKeys<T extends Record<string, unknown>>(updates: T, keys: Set<string>): T {
  for (const key of Object.keys(updates)) {
    if (keys.has(key)) {
      delete updates[key];
    }
  }
  return updates;
}

/**
 * Remove privilege-escalation fields only (role / roles / isAdmin / roleIds / permissions).
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
  for (const k in updates) {
    if (Object.prototype.hasOwnProperty.call(updates, k) && ESCALATION_SET.has(k)) return true;
  }
  return false;
}

/** True if any key in the patch is a privileged field (before stripping). */
export function hasPrivilegedUserFields(updates: Record<string, unknown>): boolean {
  for (const k in updates) {
    if (Object.prototype.hasOwnProperty.call(updates, k) && PRIVILEGED_SET.has(k)) return true;
  }
  return false;
}

/** Fields whose change must be backed by a fresh password proof (H1). */
const CREDENTIAL_CHANGE_FIELDS = ["password", "email"] as const;

/** True if any key in the patch is a credential-change field (checked before stripping). */
export function hasCredentialChangeFields(body: Record<string, unknown>): boolean {
  for (const field of CREDENTIAL_CHANGE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) return true;
  }
  return false;
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
  return isAdmin(caller);
}

/**
 * Sanitize a client JSON body for user attribute updates.
 * - Always drops prototype-pollution keys and `$` operators, at any depth
 * - Always drops server-owned identity / tenant / timestamp fields
 * - Always drops password verification-only keys
 * - Non-admin: full privileged denylist
 * - Admin: keeps role/isAdmin (caller must pass allowPrivilegeEscalation to the DB layer)
 */
export function sanitizeClientUserAttributePatch(
  raw: Record<string, unknown>,
  options: { isAdmin: boolean },
): Record<string, unknown> {
  const updates = { ...raw };
  // Run the deep guard before any field decision: a nested `{ profile: { "$set": … } }`
  // or `{ __proto__: { isAdmin: true } }` must not survive into the adapter.
  stripUnsafeKeysDeep(updates);
  for (const field of SERVER_OWNED_FIELDS) delete updates[field];
  // Never accept identity rewrite or password confirmation noise
  delete updates.user_id;
  delete updates.currentPassword;
  delete updates.confirmPassword;

  if ("password" in updates && (!updates.password || String(updates.password).trim() === "")) {
    delete updates.password;
  }

  if (!options.isAdmin) {
    stripPrivilegedUserFields(updates);
  }

  return updates;
}
