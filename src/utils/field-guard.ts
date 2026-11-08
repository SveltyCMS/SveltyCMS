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

/** Child fields of a group/object/repeater (`fields`, or `of.fields` on older shapes). */
export function childFieldsOf(field: unknown): readonly FieldInstance[] {
  if (!field || typeof field !== "object") return [];
  const asRecord = field as { fields?: unknown; of?: { fields?: unknown } };
  if (Array.isArray(asRecord.fields)) return asRecord.fields as FieldInstance[];
  if (Array.isArray(asRecord.of?.fields)) return asRecord.of.fields as FieldInstance[];
  return [];
}

/**
 * True when this field or ANY descendant declares a guard.
 * A top-level scan misses `group.salary` / `repeater.items.cost`, which makes the
 * whole collection look unguarded and bypasses redaction and filter blocking.
 */
export function fieldDeclaresGuardDeep(field: unknown): boolean {
  if (!field || typeof field !== "object") return false;
  if (fieldDeclaresGuard(field as FieldInstance)) return true;
  return childFieldsOf(field).some(fieldDeclaresGuardDeep);
}

/**
 * Dotted paths of every guarded field below `fields` (own guard included).
 * Used to block nested filters (`filter[team.salary]`), mirroring redaction.
 */
export function collectGuardedFieldPaths(fields: readonly FieldInstance[], prefix = ""): string[] {
  const out: string[] = [];
  for (const field of fields) {
    const name = (field.db_fieldName || (field as { name?: string }).name) as string | undefined;
    if (!name) continue;
    const path = prefix ? `${prefix}.${name}` : name;
    if (fieldDeclaresGuard(field)) out.push(path);
    const children = childFieldsOf(field);
    if (children.length > 0) out.push(...collectGuardedFieldPaths(children, path));
  }
  return out;
}
