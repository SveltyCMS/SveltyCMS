/**
 * @file src/utils/field-access.ts
 * @description Utility for Field-Level Access Control (FLAC) enforcement.
 *
 * ### Bug fixes (audit 2026-07):
 * - Empty roles array now correctly denies access (was fail-open)
 * - Batch-collects all write violations before throwing (anti-bruteforce)
 * - Deep cloning + dot-notation support for nested field stripping
 * - Gracefully handles null/undefined user (public, unauthenticated requests)
 */

import type { User } from "@src/databases/auth/types";
import type { FieldInstance } from "@src/content/types";
import { AppError } from "@utils/error-handling";
import { auditLogService, AuditEventType } from "@src/services/security/audit-service";
import type { DatabaseId } from "@src/databases/db-interface";
import { fieldDeclaresGuard } from "@utils/field-guard";
import { isAdmin } from "@src/databases/auth/constants";

export { fieldDeclaresGuard };

/**
 * Helper to safely delete nested fields using dot notation (e.g., 'author.role').
 */
function removeNestedField(obj: Record<string, unknown>, path: string): void {
  if (!path.includes(".")) {
    delete obj[path];
    return;
  }
  const parts = path.split(".");
  const last = parts.pop()!;
  let current: unknown = obj;

  for (const part of parts) {
    if (current == null || typeof current !== "object") return;
    current = (current as Record<string, unknown>)[part];
  }
  if (current && typeof current === "object") {
    delete (current as Record<string, unknown>)[last];
  }
}

/**
 * Checks if a user has permission to perform a specific operation on a field.
 */
export function canAccessField(
  field: FieldInstance,
  // Safely allow null/undefined for public, unauthenticated requests
  user: User | { _id: string; role: string } | null | undefined,
  operation: "read" | "write",
): boolean {
  const userRole = user?.role || "public";
  const userId = user?._id || null;

  // 1. System/Admin Bypass. isAdmin() covers the boolean, the SQLite 1 flag, and super-admin.
  if (userId === "system" || isAdmin(user)) {
    return true;
  }

  const permissions = field.permissions;
  const isHidden =
    (field as Record<string, unknown>).hidden ||
    (field as Record<string, unknown>).visibility === "hidden";

  // 2. Default Policy & Hidden Fields
  if (!permissions) {
    // Hidden fields shouldn't be writable OR readable by non-admins
    if (isHidden) return false;
    return true;
  }

  // 3. Visibility check. Collection Builder stores Private on
  // `permissions.visibility`. An empty role list means no role was granted,
  // so the field stays admin-only. A listed role is allowed for that operation.
  if (permissions.visibility === "private" || permissions.visibility === "hidden") {
    const allowed = operation === "read" ? permissions.readRoles : permissions.writeRoles;
    return Array.isArray(allowed) && allowed.includes(userRole);
  }

  if (operation === "read" && isHidden) return false;

  // 4. Auth requirement
  if (permissions.requiredAuth && !userId) {
    return false;
  }

  // 5. Role-based checks (Hardened: strict fail-closed)
  const roles = operation === "read" ? permissions.readRoles : permissions.writeRoles;

  if (Array.isArray(roles)) {
    // If array is defined but empty, NOBODY has access (except admin)
    if (roles.length === 0) return false;
    return roles.includes(userRole);
  }

  return true;
}

type FieldActor = User | { _id: string; role: string; isAdmin?: boolean } | null | undefined;

/**
 * Drop fields this actor may not read. Returns the same row when nothing is
 * removed, so an unguarded document is not copied. The input is never mutated
 * (SDK caches hold the full row for admins).
 */
export function redactRecord(
  row: unknown,
  fields: readonly FieldInstance[],
  user: FieldActor,
): unknown {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  if (!fieldDeclaresGuardOnAny(fields)) return row;

  const record = row as Record<string, unknown>;
  let copy: Record<string, unknown> | null = null;
  const keys = Object.keys(record);

  for (const field of fields) {
    if (canAccessField(field, user, "read")) continue;
    const fieldName = (field.db_fieldName || (field as { name?: string }).name) as
      | string
      | undefined;
    if (!fieldName) continue;

    const present =
      fieldName in record ||
      keys.some((key) => key.startsWith(`${fieldName}_`)) ||
      (fieldName.includes(".") && fieldName.split(".")[0] in record);
    if (!present) continue;

    if (!copy) copy = { ...record };
    removeNestedField(copy, fieldName);
    for (const key of keys) {
      if (key.startsWith(`${fieldName}_`)) delete copy[key];
    }
  }

  return copy ?? row;
}

function fieldDeclaresGuardOnAny(fields: readonly FieldInstance[]): boolean {
  for (let i = 0; i < fields.length; i++) {
    if (fieldDeclaresGuard(fields[i])) return true;
  }
  return false;
}

/**
 * Redact an SDK `{ success, data }` envelope. Same reference when no field
 * is removed, so cache hits and unguarded collections stay allocation-free.
 */
export function redactReadEnvelope<T>(
  envelope: T,
  fields: readonly FieldInstance[] | undefined,
  user: FieldActor,
): T {
  if (!envelope || typeof envelope !== "object" || !fields?.length) return envelope;
  if (!("data" in (envelope as object))) return envelope;
  const env = envelope as { data?: unknown };
  const data = env.data;
  if (data == null) return envelope;

  if (Array.isArray(data)) {
    let changed = false;
    const next = data.map((item) => {
      const stripped = redactRecord(item, fields, user);
      if (stripped !== item) changed = true;
      return stripped;
    });
    return changed ? ({ ...env, data: next } as T) : envelope;
  }

  if (typeof data === "object") {
    const stripped = redactRecord(data, fields, user);
    return stripped === data ? envelope : ({ ...env, data: stripped } as T);
  }

  return envelope;
}

/**
 * Strips fields from a data object based on user permissions.
 * Throws error on 'write' violations.
 */
export async function enforceFieldAccess(
  fields: FieldInstance[],
  data: Record<string, unknown>,
  user: User | { _id: string; role: string } | null | undefined,
  operation: "read" | "write",
  context?: { collectionName?: string; entryId?: string; tenantId?: string },
): Promise<Record<string, unknown>> {
  const userRole = user?.role || "public";
  const userId = user?._id || "anonymous";

  // 🚀 Performance: System/Admin bypass early
  if (userRole === "admin" || userId === "system") return data;

  const sanitized: Record<string, unknown> = structuredClone(data) as Record<string, unknown>;

  const dataKeys = Object.keys(sanitized);
  const writeViolations: string[] = [];

  for (const field of fields) {
    const fieldName = (field.db_fieldName || (field as Record<string, unknown>).name) as
      | string
      | undefined;
    if (!fieldName) continue;

    const isFlatPresent = fieldName in sanitized;
    const isNestedPresent = fieldName.includes(".") && fieldName.split(".")[0] in sanitized;
    const i18nKeys = dataKeys.filter((k) => k.startsWith(`${fieldName}_`));

    if (!isFlatPresent && !isNestedPresent && i18nKeys.length === 0) continue;

    if (!canAccessField(field, user, operation)) {
      if (operation === "write") {
        // Collect violations instead of throwing immediately
        writeViolations.push((field.label as string) || fieldName);
      } else {
        // For Read: Deep physical stripping
        removeNestedField(sanitized, fieldName);
        for (const key of i18nKeys) {
          delete sanitized[key];
        }
      }
    }
  }

  // Batch process write violations
  if (writeViolations.length > 0) {
    const violationString = writeViolations.join(", ");

    await auditLogService.log(
      `Blocked unauthorized write to fields: ${violationString}`,
      {
        id: userId as DatabaseId,
        email: ((user as Record<string, unknown>)?.email as string) || "unknown",
        role: userRole,
      },
      { type: "collection", id: (context?.collectionName || "unknown") as unknown as DatabaseId },
      AuditEventType.UNAUTHORIZED_ACCESS,
      "high", // Elevated severity since this touches data mutation
      {
        fields: writeViolations,
        collection: context?.collectionName || "unknown",
        entryId: context?.entryId || "new",
        operation,
      },
      context?.tenantId as DatabaseId,
      "failure",
    );

    throw new AppError(
      `Access Denied: You do not have permission to modify the following fields: [${violationString}]`,
      403,
      "FORBIDDEN",
    );
  }

  return sanitized;
}
