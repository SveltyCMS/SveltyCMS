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

/**
 * Code Units, die `String.prototype.trim()` am Anfang/Ende entfernt
 * (ECMA-262 WhiteSpace + LineTerminator, inkl. NBSP/ZWNBSP).
 */
function isTrimCodeUnit(code: number): boolean {
  return (
    (code >= 0x09 && code <= 0x0d) ||
    code === 0x20 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

/**
 * Normalisiert eine Rolle exakt wie `trim().toLowerCase()`, aber ohne
 * Allokation im Hot-Path: eine bereits normalisierte Rolle (lowercase,
 * kein Rand-Whitespace) wird unveraendert zurueckgegeben.
 */
function normalizeRole(role: string | null | undefined): string | null {
  if (!role) return null;
  // Fast Path nur, wenn das Ergebnis identisch zum Rohwert ist.
  if (
    role === role.toLowerCase() &&
    (role.length === 0 ||
      (!isTrimCodeUnit(role.charCodeAt(0)) && !isTrimCodeUnit(role.charCodeAt(role.length - 1))))
  ) {
    return role;
  }
  return role.trim().toLowerCase();
}

export function resolveRoleTier(
  role: string | null | undefined,
  isAdmin?: boolean | null,
): UserTier | null {
  if (isAdmin === true) return "admin";
  const n = normalizeRole(role);
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
