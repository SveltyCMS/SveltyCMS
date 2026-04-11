/**
 * @file src/utils/field-access.ts
 * @description Utility for Field-Level Access Control (FLAC) enforcement. (Hardened)
 */

import type { User } from "@src/databases/auth/types";
import type { FieldInstance } from "@src/content/types";
import { AppError } from "@utils/error-handling";
import { auditLogService, AuditEventType } from "@src/services/audit-log-service";
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
  const sanitized = { ...data };

  for (const field of fields) {
    const fieldName = field.db_fieldName || (field as any).name;
    if (!fieldName) continue;

    // Check if field exists in the data payload
    const hasField = fieldName in sanitized;
    // Check for i18n variants
    const i18nKeys = Object.keys(sanitized).filter((k) => k.startsWith(`${fieldName}_`));

    if (!hasField && i18nKeys.length === 0) continue;

    if (!canAccessField(field, user, operation)) {
      // F1: Throw on Write Violation instead of silent stripping
      if (operation === "write") {
        // F3: Audit the blocked attempt
        await auditLogService.logEvent({
          eventType: AuditEventType.UNAUTHORIZED_ACCESS,
          action: `Blocked unauthorized write to field: ${fieldName}`,
          actorId: user._id as DatabaseId,
          severity: "medium",
          result: "failure",
          details: {
            field: fieldName,
            collection: context?.collectionName || "unknown",
            entryId: context?.entryId || "new",
            operation,
          },
          targetType: "field",
          targetId: fieldName as any,
          tenantId: context?.tenantId as DatabaseId,
        });

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
