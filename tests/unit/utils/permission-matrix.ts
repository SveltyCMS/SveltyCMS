/**
 * @file tests/unit/utils/permission-matrix.ts
 * @description Permission matrix test helper — verifies every role × endpoint combination.
 *
 * Usage:
 * ```ts
 * testPermissionMatrix("manage:collection", [
 *   { role: "admin", expected: true },
 *   { role: "developer", expected: true },
 *   { role: "editor", expected: true },
 *   { role: "viewer", expected: false },
 *   { role: null, expected: false },  // unauthenticated
 * ]);
 * ```
 */

import { describe, it, expect } from "vitest";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { USERS, ROLES } from "@tests/harness/fixtures";
import type { User } from "@src/databases/auth/types";
import type { ISODateString, DatabaseId } from "@src/content/types";

export interface PermissionTest {
  role: string | null;
  expected: boolean;
}

/**
 * Runs a permission matrix test: for each role, checks if the permission is granted.
 * Creates a properly-typed User object for each role.
 */
export function testPermissionMatrix(
  permissionId: string,
  matrix: PermissionTest[],
  label?: string,
) {
  const suiteLabel = label || `permission: ${permissionId}`;
  describe(suiteLabel, () => {
    for (const { role, expected } of matrix) {
      const desc = role
        ? `${role} ${expected ? "CAN" : "CANNOT"} ${permissionId}`
        : `unauthenticated ${expected ? "CAN" : "CANNOT"} ${permissionId}`;

      it(desc, () => {
        if (!role) {
          // Unauthenticated — no user at all
          const user: User = {
            _id: "" as DatabaseId,
            email: "",
            role: "",
            permissions: [],
            createdAt: "" as ISODateString,
            updatedAt: "" as ISODateString,
          };
          expect(hasPermissionWithRoles(user, permissionId, [])).toBe(expected);
          return;
        }

        const userTemplate = USERS[role as keyof typeof USERS];
        const roleTemplate = ROLES[role as keyof typeof ROLES];

        if (!userTemplate) {
          throw new Error(`Unknown role: ${role}. Available: ${Object.keys(USERS).join(", ")}`);
        }

        const user: User = {
          _id: userTemplate._id as DatabaseId,
          email: userTemplate.email,
          role: userTemplate.role,
          permissions: [],
          createdAt: "" as ISODateString,
          updatedAt: "" as ISODateString,
        };

        const roles = roleTemplate
          ? [
              {
                _id: roleTemplate._id as DatabaseId,
                name: roleTemplate.name,
                isAdmin: roleTemplate.isAdmin,
                permissions: [...roleTemplate.permissions],
              },
            ]
          : [];

        expect(hasPermissionWithRoles(user, permissionId, roles)).toBe(expected);
      });
    }
  });
}

/**
 * Standard permission matrixes for common CMS operations.
 * Use these directly instead of rewriting per test.
 */
export const STANDARD_MATRICES = {
  /** Content read: everyone + public can read */
  contentRead: [
    { role: "admin", expected: true },
    { role: "developer", expected: true },
    { role: "editor", expected: true },
    { role: "viewer", expected: true },
    { role: null, expected: true },
  ] as PermissionTest[],

  /** Content write: only admin/dev/editor can write */
  contentWrite: [
    { role: "admin", expected: true },
    { role: "developer", expected: true },
    { role: "editor", expected: true },
    { role: "viewer", expected: false },
    { role: null, expected: false },
  ] as PermissionTest[],

  /** System settings: only admin/dev */
  systemSettings: [
    { role: "admin", expected: true },
    { role: "developer", expected: true },
    { role: "editor", expected: false },
    { role: "viewer", expected: false },
    { role: null, expected: false },
  ] as PermissionTest[],

  /** User management: admin only */
  userManagement: [
    { role: "admin", expected: true },
    { role: "developer", expected: false },
    { role: "editor", expected: false },
    { role: "viewer", expected: false },
    { role: null, expected: false },
  ] as PermissionTest[],
};
