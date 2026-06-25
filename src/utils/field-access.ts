/**
 * @file src/utils/field-access.ts
 * @description Utility for Field-Level Access Control (FLAC) enforcement. (Hardened)
 */

import type { User } from "@src/databases/auth/types";
import type { FieldInstance } from "@src/content/types";
import { AppError } from "@utils/error-handling";
import { auditLogService, AuditEventType } from "@src/services/security/audit-service";
import type { DatabaseId } from "@src/databases/db-interface";

/**
 * Checks if a user has permission to perform a specific operation on a field.
 */
export function canAccessField(
  field: FieldInstance,
  user: User | { _id: string; role: string },
  operation: "read" | "write",
): boolean {
  // 1. System/Admin Bypass
  if (user.role === "admin" || user._id === "system") return true;

  const permissions = field.permissions;

  // 2. Default Policy (Hardened - F2)
  // If no permissions defined, we check if it's a hidden field
  if (!permissions) {
    if (operation === "read" && (field as any).hidden) return false;
    return true;
  }

  // 3. Visibility check (Read only)
  if (operation === "read" && (field as any).visibility === "hidden") {
    return false;
  }

  // 4. Auth requirement
  if (permissions.requiredAuth && !user._id) {
    return false;
  }

  // 5. Role-based checks (Fail-Closed)
  const roles = operation === "read" ? permissions.readRoles : permissions.writeRoles;

  if (Array.isArray(roles) && roles.length > 0) {
    return roles.includes(user.role);
  }

  // If no specific roles defined but auth is required, we already checked it
  return true;
}

/**
 * Strips fields from a data object based on user permissions.
 * Throws error on 'write' violations (F1).
 */
export async function enforceFieldAccess(
  fields: FieldInstance[],
  data: Record<string, any>,
  user: User | { _id: string; role: string },
  operation: "read" | "write",
  context?: { collectionName?: string; entryId?: string; tenantId?: string },
): Promise<Record<string, any>> {
  // 🚀 Performance: System/Admin bypass early
  if (user.role === "admin" || user._id === "system") return data;

  const sanitized = { ...data };
  const dataKeys = Object.keys(sanitized);

  for (const field of fields) {
    const fieldName = field.db_fieldName || (field as any).name;
    if (!fieldName) continue;

    // Check if field exists in the data payload
    const hasField = fieldName in sanitized;

    // 🚀 Optimize i18n lookup: Use pre-fetched keys
    const i18nKeys = dataKeys.filter((k) => k.startsWith(`${fieldName}_`));

    if (!hasField && i18nKeys.length === 0) continue;

    if (!canAccessField(field, user, operation)) {
      // F1: Throw on Write Violation instead of silent stripping
      if (operation === "write") {
        // F3: Audit the blocked attempt
        await auditLogService.log(
          `Blocked unauthorized write to field: ${fieldName}`,
          {
            id: user._id as DatabaseId,
            email: (user as any).email || "unknown",
            role: user.role,
          },
          { type: "field", id: fieldName as any },
          AuditEventType.UNAUTHORIZED_ACCESS,
          "medium",
          {
            field: fieldName,
            collection: context?.collectionName || "unknown",
            entryId: context?.entryId || "new",
            operation,
          },
          context?.tenantId as DatabaseId,
          "failure",
        );

        throw new AppError(
          `Access Denied: You do not have permission to modify the field '${field.label || fieldName}'`,
          403,
          "FORBIDDEN",
        );
      }

      // For Read: Physical stripping
      delete sanitized[fieldName];
      for (const key of i18nKeys) {
        delete sanitized[key];
      }
    }
  }

  return sanitized;
}
