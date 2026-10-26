/**
 * @file tests/unit/security/permission-registry-consistency.test.ts
 * @description Guards the canonical permission catalog against drift.
 *
 * Asserts that every permission-bearing surface in the CMS resolves through
 * `PERMISSION_CATALOG`:
 * - capability-registry ids (`CORE_CAPABILITIES`)
 * - 64-bit bitmask ids (`PERMISSION_BITS`) and their aliases
 * - built-in role grants (`defaultRoles` / `DEFAULT_ROLE_GRANTS`)
 * - endpoint-dispatch ids (`_ENDPOINT_PERMISSIONS`)
 * - API endpoint keys (`API_PERMISSIONS`)
 *
 * Features tested:
 * - catalog id uniqueness and alias targets
 * - capability ↔ catalog parity
 * - bit ↔ catalog parity and unique static bit indices
 * - collections:create/update/delete → collections:write aliasing
 * - ai:use / ai:admin static bits and dynamic-allocation headroom
 * - `testing` endpoint admin-only dispatcher gate (test bypass stays exempt)
 */

import { describe, it, expect } from "vitest";
import {
  PERMISSION_CATALOG,
  PERMISSION_CATALOG_BY_ID,
  PERMISSION_ALIASES,
  DEFAULT_ROLE_GRANTS,
  isCatalogPermissionId,
  resolvePermissionId,
} from "@src/databases/auth/permission-catalog";
import { PERMISSION_BITS, getPermissionBit } from "@src/databases/auth/permission-bitmask";
import { isAcceptablePermissionId } from "@src/databases/auth/permissions";
import { corePermissions } from "@src/databases/auth/core-permissions";
import { CORE_CAPABILITIES } from "@src/services/security/capability-registry";
import { defaultRoles } from "@src/databases/auth/default-roles";
import { API_PERMISSIONS } from "@src/databases/auth/api-permissions";
import { _ENDPOINT_PERMISSIONS, _checkEndpointPermission } from "@src/routes/api/[...path]/+server";
import type { Role, User } from "@src/databases/auth/types";
import type { DatabaseId, ISODateString } from "@src/content/types";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

describe("Permission catalog — shape", () => {
  it("has unique ids", () => {
    const ids = PERMISSION_CATALOG.map((permission) => permission.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every entry a category and description", () => {
    for (const permission of PERMISSION_CATALOG) {
      expect(permission.category, permission.id).toBeTruthy();
      expect(permission.description.length, permission.id).toBeGreaterThan(0);
    }
  });

  it("only points aliases at canonical entries", () => {
    for (const [alias, canonical] of Object.entries(PERMISSION_ALIASES)) {
      expect(PERMISSION_CATALOG_BY_ID.has(canonical), `${alias} -> ${canonical}`).toBe(true);
      expect(PERMISSION_CATALOG_BY_ID.has(alias), `${alias} must be an alias only`).toBe(false);
      expect(resolvePermissionId(alias), alias).toBe(canonical);
    }
  });

  it("leaves unknown ids untouched (string compatibility)", () => {
    expect(resolvePermissionId("plugin:example:dynamic")).toBe("plugin:example:dynamic");
    expect(isCatalogPermissionId("plugin:example:dynamic")).toBe(false);
  });
});

describe("Permission catalog — capabilities", () => {
  it("resolves every core capability", () => {
    for (const capability of CORE_CAPABILITIES) {
      expect(PERMISSION_CATALOG_BY_ID.has(capability), capability).toBe(true);
    }
  });

  it("derives CORE_CAPABILITIES exactly from capability-flagged entries", () => {
    const flagged = PERMISSION_CATALOG.filter((permission) => permission.capability === true).map(
      (permission) => permission.id,
    );

    expect(new Set(CORE_CAPABILITIES)).toEqual(new Set(flagged));
    expect(new Set(CORE_CAPABILITIES).size).toBe(CORE_CAPABILITIES.length);
  });
});

describe("Permission catalog — bitmask", () => {
  it("resolves every bit key to a catalog id", () => {
    for (const [id, bit] of Object.entries(PERMISSION_BITS)) {
      const canonical = resolvePermissionId(id);
      expect(PERMISSION_CATALOG_BY_ID.has(canonical), id).toBe(true);
      expect(PERMISSION_BITS[canonical], `${id} must share ${canonical}'s bit`).toBe(bit);
    }
  });

  it("emits a bit for every bit-indexed catalog entry", () => {
    for (const permission of PERMISSION_CATALOG) {
      if (permission.bitIndex === undefined) continue;
      expect(PERMISSION_BITS[permission.id], permission.id).toBe(1n << BigInt(permission.bitIndex));
    }
  });

  it("assigns each static bit index at most once", () => {
    const indices = PERMISSION_CATALOG.flatMap((permission) =>
      permission.bitIndex === undefined ? [] : [permission.bitIndex],
    );

    expect(new Set(indices).size).toBe(indices.length);
    for (const index of indices) {
      expect(index).toBeGreaterThanOrEqual(0);
      // Bit 63 is reserved as the field-level presence indicator.
      expect(index).toBeLessThan(63);
    }
  });

  it("pins ai:use and ai:admin to their static bits", () => {
    expect(PERMISSION_BITS["ai:use"]).toBe(1n << 43n);
    expect(PERMISSION_BITS["ai:admin"]).toBe(1n << 44n);
  });

  it("never allocates a dynamic bit over a static ai bit", () => {
    const dynamic = getPermissionBit("__consistency:dynamic-permission__");
    const staticBits = PERMISSION_CATALOG.flatMap((permission) =>
      permission.bitIndex === undefined ? [] : [permission.bitIndex],
    );
    const highestStaticBit = BigInt(Math.max(...staticBits) + 1);

    expect(dynamic).not.toBe(0n);
    expect(dynamic & PERMISSION_BITS["ai:use"]).toBe(0n);
    expect(dynamic & PERMISSION_BITS["ai:admin"]).toBe(0n);
    expect(dynamic).toBe(1n << highestStaticBit);
  });
});

describe("Permission catalog — built-in roles", () => {
  it("resolves every permission granted by a default role", () => {
    for (const role of defaultRoles) {
      for (const permission of role.permissions ?? []) {
        expect(isCatalogPermissionId(permission), `${role.name} -> ${permission}`).toBe(true);
      }
    }
  });

  it("resolves every canonical role grant", () => {
    for (const [role, grants] of Object.entries(DEFAULT_ROLE_GRANTS)) {
      for (const permission of grants) {
        expect(isCatalogPermissionId(permission), `${role} -> ${permission}`).toBe(true);
      }
    }
  });
});

describe("Permission catalog — role-save acceptance", () => {
  // `validateRoles` used to accept only ids present in the legacy `corePermissions`
  // registry, which trails the catalog. The built-in Editor role grants
  // `collections:read_drafts` (catalog-only), so saving the Roles tab answered
  // HTTP 400 "Invalid permission: collections:read_drafts" for the whole payload.
  it("accepts a catalog-only id that the legacy registry never registered", () => {
    const registered = new Set(corePermissions.map((permission) => permission._id as string));

    expect(registered.has("collections:read_drafts")).toBe(false);
    expect(isAcceptablePermissionId("collections:read_drafts")).toBe(true);
  });

  it("accepts every id a built-in role can carry", () => {
    for (const grants of Object.values(DEFAULT_ROLE_GRANTS)) {
      for (const permission of grants) {
        expect(isAcceptablePermissionId(permission), permission).toBe(true);
      }
    }
    for (const role of defaultRoles) {
      for (const permission of role.permissions ?? []) {
        expect(isAcceptablePermissionId(permission), `${role.name} -> ${permission}`).toBe(true);
      }
    }
  });

  it("still accepts registry-only ids and their aliases", () => {
    expect(isAcceptablePermissionId("system:dashboard")).toBe(true);
    expect(isAcceptablePermissionId("collections:update")).toBe(true);
  });

  it("still rejects ids that no catalog or registry knows", () => {
    expect(isAcceptablePermissionId("not:a:permission")).toBe(false);
  });
});

describe("Permission catalog — endpoint gates", () => {
  it("resolves every ENDPOINT_PERMISSIONS mapping for every method", () => {
    for (const [namespace, mapping] of Object.entries(_ENDPOINT_PERMISSIONS)) {
      const required =
        typeof mapping === "function" ? METHODS.map((method) => mapping(method)) : [mapping];

      for (const permission of required) {
        expect(isCatalogPermissionId(permission), `${namespace} -> ${permission}`).toBe(true);
      }
    }
  });

  it("resolves every API_PERMISSIONS endpoint key", () => {
    for (const endpoint of Object.keys(API_PERMISSIONS)) {
      expect(isCatalogPermissionId(endpoint), endpoint).toBe(true);
    }
  });

  it("keeps the testing endpoint admin-only at the dispatcher", () => {
    expect(API_PERMISSIONS["api:testing"]).toEqual(["*"]);
    // The harness reaches /api/testing through __testBypass; a normal
    // authenticated non-admin must not pass the namespace-root gate.
    expect(_ENDPOINT_PERMISSIONS.testing).toBe("system:admin");

    const role: Role = {
      _id: "consistency-editor" as DatabaseId,
      name: "Consistency Editor",
      permissions: [],
      isAdmin: false,
    };
    const user: User = {
      _id: "consistency-user" as DatabaseId,
      email: "consistency@example.com",
      role: "consistency-editor",
      permissions: [],
      createdAt: "2026-01-01T00:00:00.000Z" as ISODateString,
      updatedAt: "2026-01-01T00:00:00.000Z" as ISODateString,
    };

    expect(_checkEndpointPermission(user, [role], "GET", "testing", ["testing"])).toBe(false);
    expect(_checkEndpointPermission(null, [], "GET", "testing", ["testing"])).toBe(false);

    const adminUser: User = {
      ...user,
      _id: "consistency-admin" as DatabaseId,
      role: "admin",
      isAdmin: true,
    };
    const adminRole: Role = { ...role, isAdmin: true, permissions: ["system:admin"] };
    expect(_checkEndpointPermission(adminUser, [adminRole], "GET", "testing", ["testing"])).toBe(
      true,
    );
  });
});

describe("Permission catalog — resolved conflicts", () => {
  it("aliases collection verbs to the collections:write gate", () => {
    for (const alias of ["collections:create", "collections:update", "collections:delete"]) {
      expect(resolvePermissionId(alias), alias).toBe("collections:write");
      expect(PERMISSION_BITS[alias], alias).toBe(PERMISSION_BITS["collections:write"]);
    }
  });

  it("aliases user plural verbs to their singular canonical ids", () => {
    expect(resolvePermissionId("users:read")).toBe("user:read");
    expect(resolvePermissionId("users:write")).toBe("user:write");
    expect(PERMISSION_BITS["users:read"]).toBe(PERMISSION_BITS["user:read"]);
    expect(PERMISSION_BITS["users:write"]).toBe(PERMISSION_BITS["user:write"]);
  });

  it("aliases kebab-case API keys to camelCase permission ids", () => {
    expect(resolvePermissionId("api:export-data")).toBe("api:exportData");
    expect(resolvePermissionId("api:system-preferences")).toBe("api:systemPreferences");
  });
});
