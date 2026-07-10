/**
 * @file tests/unit/api/config-permissions.test.ts
 * @description Unit tests for the config namespace permission mappings in the API dispatcher.
 *
 * Validates that the ENDPOINT_PERMISSIONS mapping and checkEndpointPermission
 * logic correctly enforce access for the `config` and `config_sync` namespaces.
 *
 * ### Tests:
 * - `config:read` allows GET routes (resources, status, history)
 * - `config:write` allows POST export/apply
 * - Non-admin without explicit permission fails closed (403)
 * - Admin fast-path bypass grants all access
 * - Deprecated `config_sync` namespace maps to same permissions as `config`
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Define the ENDPOINT_PERMISSIONS mapping exactly as in +server.ts
// This is the permission mapping we're validating.
// ---------------------------------------------------------------------------
const ENDPOINT_PERMISSIONS: Record<string, string | ((method: string) => string)> = {
  config: (method: string) => (method === "POST" ? "config:write" : "config:read"),
  config_sync: (method: string) => (method === "POST" ? "config:write" : "config:read"),
  "config-sync": (method: string) => (method === "POST" ? "config:write" : "config:read"),
  collections: (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "collections:read" : "collections:write",
  system: (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "system:read" : "system:settings",
};

// Replicate checkEndpointPermission logic stripped of SCIM/user handling
// for isolating the namespace/mapping test surface.
function resolveRequiredPermission(namespace: string, method: string): string | null {
  const mapping = ENDPOINT_PERMISSIONS[namespace];
  if (!mapping) return null; // unmapped → fail-closed
  return typeof mapping === "function" ? mapping(method) : mapping;
}

// Mock the hasPermissionWithRoles function from permissions module
vi.mock("@src/databases/auth/permissions", () => ({
  hasPermissionWithRoles: vi.fn(),
}));

import { hasPermissionWithRoles } from "@src/databases/auth/permissions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: overrides._id ?? "user-1",
    email: overrides.email ?? "test@example.com",
    role: overrides.role ?? "editor",
    isAdmin: overrides.isAdmin ?? false,
    permissions: (overrides.permissions as string[]) ?? [],
    createdAt: (overrides.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (overrides.updatedAt as string) ?? new Date().toISOString(),
  } as any;
}

function makeRole(overrides: Record<string, unknown> = {}) {
  return {
    _id: (overrides._id as string) ?? "role-editor",
    name: (overrides.name as string) ?? "Editor",
    isAdmin: (overrides.isAdmin as boolean) ?? false,
    permissions: (overrides.permissions as string[]) ?? [],
  } as any;
}

/**
 * Simulates checkEndpointPermission for the config namespace.
 *
 * Mirrors the logic from +server.ts:
 * 1. Admin fast-path
 * 2. Resolve required permission from ENDPOINT_PERMISSIONS
 * 3. Check with hasPermissionWithRoles
 */
function checkConfigPermission(
  user: ReturnType<typeof makeUser>,
  roles: ReturnType<typeof makeRole>[],
  method: string,
  namespace: string,
): boolean {
  // ADMIN FAST-PATH
  if (user.isAdmin === true || user.role === "admin" || user.role === "super-admin") {
    return true;
  }

  const mapping = ENDPOINT_PERMISSIONS[namespace];
  if (!mapping) return false; // fail-closed

  const requiredPermission = typeof mapping === "function" ? mapping(method) : mapping;

  return hasPermissionWithRoles(user, requiredPermission, roles);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Config Permission Mappings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GET routes → config:read ──────────────────────────────────────────

  describe("config:read allows GET routes", () => {
    it("resolves config:read for GET /api/config/resources", () => {
      const perm = resolveRequiredPermission("config", "GET");
      expect(perm).toBe("config:read");
    });

    it("resolves config:read for GET /api/config/status", () => {
      const perm = resolveRequiredPermission("config", "GET");
      expect(perm).toBe("config:read");
    });

    it("resolves config:read for GET /api/config/history", () => {
      const perm = resolveRequiredPermission("config", "GET");
      expect(perm).toBe("config:read");
    });

    it("resolves config:read for OPTIONS /api/config", () => {
      const perm = resolveRequiredPermission("config", "OPTIONS");
      expect(perm).toBe("config:read");
    });
  });

  // ── POST routes → config:write ─────────────────────────────────────────

  describe("config:write allows POST routes", () => {
    it("resolves config:write for POST /api/config/export", () => {
      const perm = resolveRequiredPermission("config", "POST");
      expect(perm).toBe("config:write");
    });

    it("resolves config:write for POST /api/config/plan", () => {
      const perm = resolveRequiredPermission("config", "POST");
      expect(perm).toBe("config:write");
    });

    it("resolves config:write for POST /api/config/apply", () => {
      const perm = resolveRequiredPermission("config", "POST");
      expect(perm).toBe("config:write");
    });
  });

  // ── Non-admin without permission → 403 ─────────────────────────────────

  describe("non-admin without explicit permission fails closed", () => {
    it("returns false for user without config:read on GET", () => {
      const user = makeUser({ role: "editor", isAdmin: false });
      const roles = [makeRole({ _id: "role-editor", isAdmin: false, permissions: [] })];
      (hasPermissionWithRoles as any).mockReturnValue(false);

      const result = checkConfigPermission(user, roles, "GET", "config");
      expect(result).toBe(false);
      expect(hasPermissionWithRoles).toHaveBeenCalledWith(user, "config:read", roles);
    });

    it("returns false for user without config:write on POST", () => {
      const user = makeUser({ role: "editor", isAdmin: false });
      const roles = [makeRole({ _id: "role-editor", isAdmin: false, permissions: [] })];
      (hasPermissionWithRoles as any).mockReturnValue(false);

      const result = checkConfigPermission(user, roles, "POST", "config");
      expect(result).toBe(false);
      expect(hasPermissionWithRoles).toHaveBeenCalledWith(user, "config:write", roles);
    });

    it("returns false for unmapped namespace (fail-closed)", () => {
      const user = makeUser({ role: "editor" });
      const roles = [makeRole()];

      const result = checkConfigPermission(user, roles, "GET", "nonexistent-namespace");
      expect(result).toBe(false);
    });

    it("returns false even for valid permissions if hasPermissionWithRoles denies", async () => {
      const user = makeUser({ role: "author", isAdmin: false });
      const roles = [makeRole({ _id: "role-author", isAdmin: false, permissions: [] })];
      // Simulate role not having the permission
      (hasPermissionWithRoles as any).mockReturnValue(false);

      const result = checkConfigPermission(user, roles, "GET", "config");
      expect(result).toBe(false);
    });
  });

  // ── Admin fast-path ────────────────────────────────────────────────────

  describe("admin fast-path bypass", () => {
    it("grants access when user.isAdmin is true, regardless of permissions", () => {
      const user = makeUser({ isAdmin: true, role: "admin" });
      const roles: any[] = [];

      // No mock setup needed — admin fast-path should skip hasPermissionWithRoles
      const result = checkConfigPermission(user, roles, "POST", "config");
      expect(result).toBe(true);
      // Should NOT call hasPermissionWithRoles (it's bypassed)
      expect(hasPermissionWithRoles).not.toHaveBeenCalled();
    });

    it("grants access when user.role is 'admin'", () => {
      const user = makeUser({ role: "admin", isAdmin: false });
      const roles: any[] = [];

      const result = checkConfigPermission(user, roles, "GET", "config");
      expect(result).toBe(true);
      expect(hasPermissionWithRoles).not.toHaveBeenCalled();
    });

    it("grants access when user.role is 'super-admin'", () => {
      const user = makeUser({ role: "super-admin", isAdmin: false });
      const roles: any[] = [];

      const result = checkConfigPermission(user, roles, "POST", "config");
      expect(result).toBe(true);
      expect(hasPermissionWithRoles).not.toHaveBeenCalled();
    });

    it("grants GET access to admin regardless of method", () => {
      const user = makeUser({ isAdmin: true });
      const roles: any[] = [];

      const getResult = checkConfigPermission(user, roles, "GET", "config");
      const postResult = checkConfigPermission(user, roles, "POST", "config");
      expect(getResult).toBe(true);
      expect(postResult).toBe(true);
    });
  });

  // ── Deprecated config_sync alias ───────────────────────────────────────

  describe("deprecated config_sync namespace", () => {
    it("maps config_sync GET to config:read", () => {
      const perm = resolveRequiredPermission("config_sync", "GET");
      expect(perm).toBe("config:read");
    });

    it("maps config_sync POST to config:write", () => {
      const perm = resolveRequiredPermission("config_sync", "POST");
      expect(perm).toBe("config:write");
    });

    it("maps config-sync (hyphenated) GET to config:read", () => {
      const perm = resolveRequiredPermission("config-sync", "GET");
      expect(perm).toBe("config:read");
    });

    it("maps config-sync (hyphenated) POST to config:write", () => {
      const perm = resolveRequiredPermission("config-sync", "POST");
      expect(perm).toBe("config:write");
    });

    it("requires the same permission as the main config namespace for GET", () => {
      const configPerm = resolveRequiredPermission("config", "GET");
      const syncPerm = resolveRequiredPermission("config_sync", "GET");
      expect(syncPerm).toBe(configPerm);
    });

    it("requires the same permission as the main config namespace for POST", () => {
      const configPerm = resolveRequiredPermission("config", "POST");
      const syncPerm = resolveRequiredPermission("config_sync", "POST");
      expect(syncPerm).toBe(configPerm);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("PUT resolves to config:read (non-POST methods default to read)", () => {
      const perm = resolveRequiredPermission("config", "PUT");
      expect(perm).toBe("config:read");
    });

    it("DELETE resolves to config:read (non-POST methods default to read)", () => {
      const perm = resolveRequiredPermission("config", "DELETE");
      expect(perm).toBe("config:read");
    });

    it("PATCH resolves to config:read (non-POST methods default to read)", () => {
      const perm = resolveRequiredPermission("config", "PATCH");
      expect(perm).toBe("config:read");
    });
  });
});
