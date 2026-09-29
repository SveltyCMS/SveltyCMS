/**
 * @file src/utils/field-guard.ts
 * @description Pure predicate for schema field-access restrictions.
 *
 * One definition shared by `canAccessField`, `hasGuardedFields`, and the
 * schema hot-flag scan. A second copy is how `permissions.visibility`
 * was enforced in one place and ignored in the others.
 *
 * ### Features:
 * - `permissions.visibility` of `private` or `hidden` is a guard even when role lists are empty
 * - Non-empty `readRoles` / `writeRoles`, `requiredAuth`, and top-level hidden/private flags count
 * - No I/O. Safe on the schema-compile path
 */

import type { FieldInstance } from "@src/content/types";

/** True when this field declares a restriction the read/write paths must honor. */
export function fieldDeclaresGuard(field: FieldInstance): boolean {
  const permissions = field.permissions;
  if (permissions) {
    const visibility = permissions.visibility;
    if (visibility === "private" || visibility === "hidden") return true;
    if (Array.isArray(permissions.readRoles) && permissions.readRoles.length > 0) return true;
    if (Array.isArray(permissions.writeRoles) && permissions.writeRoles.length > 0) return true;
    if (permissions.requiredAuth) return true;
  }
  const extra = field as { hidden?: boolean; visibility?: string };
  return Boolean(extra.hidden || extra.visibility === "hidden" || extra.visibility === "private");
}
