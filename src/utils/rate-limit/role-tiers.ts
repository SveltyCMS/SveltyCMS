/**
 * @file src/utils/rate-limit/role-tiers.ts
 * @description RBAC-driven rate-limit tiers. Hot path is a Set lookup.
 * Roles are seeded from getAllRoles() (authorization / config), never queried
 * on the limiter path.
 */

import type { UserTier } from "./adaptive";

const adminRoles = new Set<string>(["admin"]);
const staffRoles = new Set<string>();

const WRITE_HINT = /(?:^|[:.])(?:write|create|update|delete|manage)(?:$|[:.])/i;

export function seedRoleTier(
  name: string | null | undefined,
  flags: { isAdmin?: boolean; permissions?: readonly string[] },
): void {
  const n = name?.trim().toLowerCase();
  if (!n) return;
  if (flags.isAdmin || n === "admin") {
    adminRoles.add(n);
    staffRoles.delete(n);
    return;
  }
  const perms = flags.permissions ?? [];
  if (perms.some((p) => WRITE_HINT.test(p))) {
    staffRoles.add(n);
  } else {
    staffRoles.delete(n);
  }
}

export function seedRoleTiers(
  roles: ReadonlyArray<{
    name?: string | null;
    isAdmin?: boolean;
    permissions?: readonly string[];
  }>,
): void {
  for (const role of roles) {
    seedRoleTier(role.name, { isAdmin: role.isAdmin, permissions: role.permissions });
  }
}

export function resolveRoleTier(
  role: string | null | undefined,
  isAdmin?: boolean | null,
): UserTier | null {
  if (isAdmin === true) return "admin";
  const n = role?.trim().toLowerCase();
  if (!n) return null;
  if (adminRoles.has(n)) return "admin";
  if (staffRoles.has(n)) return "staff";
  return null;
}

export function _resetRoleTiers(): void {
  adminRoles.clear();
  adminRoles.add("admin");
  staffRoles.clear();
}
