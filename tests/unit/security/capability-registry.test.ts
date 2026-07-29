/**
 * @file tests/unit/security/capability-registry.test.ts
 * @description Unit tests for the merged capability registry and role reconciliation.
 *
 * Features tested:
 * - Core capability catalog
 * - Plugin capability registration/deregistration
 * - Merged catalog computation
 * - Owner capability auto-inheritance
 * - hasCapability() with core + plugin IDs
 * - Owner role reconciliation
 * - Built-in role reconciliation (owner only)
 * - canManagePluginSettings / canExecutePlugins
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  capabilityRegistry,
  CORE_CAPABILITIES,
  reconcileOwnerRole,
  reconcileBuiltinRoles,
  isOwnerRole,
  findOwnerRole,
} from "@src/services/security/capability-registry";
import type { Role, User } from "@src/databases/auth/types";

// Helpers
function createUser(overrides: Partial<User> = {}): User {
  return {
    _id: "user-1" as any,
    email: "test@example.com",
    role: "admin",
    permissions: [],
    isAdmin: false,
    createdAt: "2026-01-01T00:00:00.000Z" as any,
    updatedAt: "2026-01-01T00:00:00.000Z" as any,
    ...overrides,
  } as User;
}

function createRole(overrides: Partial<Role> = {}): Role {
  return {
    _id: "role-1" as any,
    name: "Administrator",
    permissions: [],
    isNative: false,
    ...overrides,
  };
}

describe("Capability Registry — Core Catalog", () => {
  it("should contain essential core capabilities", () => {
    const caps = CORE_CAPABILITIES;

    // Content
    expect(caps).toContain("collection:read");
    expect(caps).toContain("collection:write");
    expect(caps).toContain("collection:delete");

    // Media
    expect(caps).toContain("media:read");
    expect(caps).toContain("media:write");
    expect(caps).toContain("media:delete");

    // Users
    expect(caps).toContain("user:read");
    expect(caps).toContain("user:write");
    expect(caps).toContain("user:manage");

    // System
    expect(caps).toContain("system:read");
    expect(caps).toContain("system:settings");
    expect(caps).toContain("system:admin");

    // Plugin system
    expect(caps).toContain("plugin:settings:manage");
    expect(caps).toContain("plugins:execute");
  });

  it("should start with only core capabilities in the merged catalog", () => {
    const all = capabilityRegistry.getAllCapabilities();
    expect(all.length).toBeGreaterThanOrEqual(CORE_CAPABILITIES.length);
  });
});

describe("Capability Registry — Plugin Registration", () => {
  beforeEach(() => {
    capabilityRegistry.clear();
  });

  it("should register plugin capabilities and merge with core", () => {
    const before = capabilityRegistry.getAllCapabilities().length;

    capabilityRegistry.registerPlugin("test-plugin", ["db:read", "db:write", "media:read"] as any);

    const after = capabilityRegistry.getAllCapabilities().length;
    // Should have at least the core caps + 1 unique plugin cap (db:read and db:write are not in CORE_CAPABILITIES)
    expect(after).toBeGreaterThan(before);
  });

  it("should deduplicate capabilities already in core", () => {
    capabilityRegistry.registerPlugin("test-plugin", [
      "media:read", // already in core
      "media:write", // already in core
    ] as any);

    const all = capabilityRegistry.getAllCapabilities();
    const mediaReadCount = all.filter((c) => c === "media:read").length;
    expect(mediaReadCount).toBe(1); // No duplicates
  });

  it("should deregister plugin capabilities", () => {
    capabilityRegistry.registerPlugin("test-plugin", ["db:read"] as any);
    const withPlugin = capabilityRegistry.getAllCapabilities().length;

    capabilityRegistry.deregisterPlugin("test-plugin");
    const after = capabilityRegistry.getAllCapabilities().length;

    expect(after).toBeLessThan(withPlugin);
  });

  it("should call deregisterPlugin with no effect for non-existent plugin", () => {
    const before = capabilityRegistry.getAllCapabilities();
    capabilityRegistry.deregisterPlugin("nonexistent");
    const after = capabilityRegistry.getAllCapabilities();
    expect(after).toEqual(before);
  });
});

describe("Capability Registry — getOwnerCapabilities", () => {
  beforeEach(() => {
    capabilityRegistry.clear();
  });

  it("should return all core capabilities when no plugins registered", () => {
    const ownerCaps = capabilityRegistry.getOwnerCapabilities();
    expect(ownerCaps.length).toBeGreaterThanOrEqual(CORE_CAPABILITIES.length);
  });

  it("should include plugin capabilities in owner's set", () => {
    capabilityRegistry.registerPlugin("test-plugin", ["db:read"] as any);
    const ownerCaps = capabilityRegistry.getOwnerCapabilities();
    // Auto-prefixed: plugin:test-plugin:db:read
    expect(ownerCaps).toContain("plugin:test-plugin:db:read");
  });
});

describe("Capability Registry — hasCapability", () => {
  const adminUser = createUser({ isAdmin: true, role: "admin" });
  const regularUser = createUser({ isAdmin: false, role: "editor" });

  const editorRole = createRole({
    _id: "editor" as any,
    name: "Editor",
    permissions: ["collection:read", "media:read"],
  });

  it("should return true for admin users regardless of capability", () => {
    expect(capabilityRegistry.hasCapability(adminUser, "collection:write", [])).toBe(true);
    expect(capabilityRegistry.hasCapability(adminUser, "system:admin", [])).toBe(true);
    expect(capabilityRegistry.hasCapability(adminUser, "nonexistent:perm" as any, [])).toBe(true);
  });

  it("should return false for null/undefined users", () => {
    expect(capabilityRegistry.hasCapability(null, "collection:read", [])).toBe(false);
    expect(capabilityRegistry.hasCapability(undefined, "collection:read", [])).toBe(false);
  });

  it("should check role permissions for regular users", () => {
    expect(capabilityRegistry.hasCapability(regularUser, "collection:read", [editorRole])).toBe(
      true,
    );
    expect(capabilityRegistry.hasCapability(regularUser, "collection:write", [editorRole])).toBe(
      false,
    );
  });

  it("should return false when user's role is not in the roles list", () => {
    const otherRole = createRole({
      _id: "admin" as any,
      name: "Administrator",
      permissions: ["collection:write"],
    });
    expect(capabilityRegistry.hasCapability(regularUser, "collection:write", [otherRole])).toBe(
      false,
    );
  });

  it("should return true when an admin role is in the list", () => {
    const adminRole = createRole({
      _id: "editor" as any,
      name: "Editor",
      isAdmin: true,
      permissions: [],
    });
    expect(capabilityRegistry.hasCapability(regularUser, "system:admin", [adminRole])).toBe(true);
  });

  it("should accept plugin-declared string capability IDs", () => {
    capabilityRegistry.registerPlugin("test-plugin", ["custom:action"] as any);
    // After auto-prefixing, the capability is stored as plugin:test-plugin:custom:action
    const role = createRole({
      _id: "editor" as any,
      name: "Editor",
      permissions: ["plugin:test-plugin:custom:action"],
    });
    expect(
      capabilityRegistry.hasCapability(regularUser, "plugin:test-plugin:custom:action" as any, [
        role,
      ]),
    ).toBe(true);
  });
});

describe("Capability Registry — Gate Helpers", () => {
  const adminUser = createUser({ isAdmin: true, role: "admin" });

  it("should allow admin to manage plugin settings", () => {
    expect(capabilityRegistry.canManagePluginSettings(adminUser, [])).toBe(true);
  });

  it("should allow admin to execute plugins", () => {
    expect(capabilityRegistry.canExecutePlugins(adminUser, [])).toBe(true);
  });

  it("should deny null users", () => {
    expect(capabilityRegistry.canManagePluginSettings(null, [])).toBe(false);
    expect(capabilityRegistry.canExecutePlugins(null, [])).toBe(false);
  });
});

describe("Role Reconciliation — reconcileOwnerRole", () => {
  beforeEach(() => {
    capabilityRegistry.clear();
  });

  it("should add missing capabilities to the owner role", () => {
    const ownerRole = createRole({
      _id: "owner" as any,
      name: "Owner",
      isNative: true,
      permissions: ["collection:read"], // Only one permission initially
    });

    const reconciled = reconcileOwnerRole(ownerRole);

    expect(reconciled.permissions.length).toBeGreaterThan(1);
    expect(reconciled.permissions).toContain("collection:read");
    expect(reconciled.permissions).toContain("system:admin");
  });

  it("should not remove any existing capabilities from owner", () => {
    const ownerRole = createRole({
      _id: "owner" as any,
      name: "Owner",
      isNative: true,
      permissions: ["collection:read", "collection:write", "system:admin"],
    });

    const reconciled = reconcileOwnerRole(ownerRole);

    expect(reconciled.permissions).toContain("collection:read");
    expect(reconciled.permissions).toContain("collection:write");
    expect(reconciled.permissions).toContain("system:admin");
  });

  it("should add plugin capabilities to owner", () => {
    capabilityRegistry.registerPlugin("test-plugin", ["custom:perm"] as any);

    const ownerRole = createRole({
      _id: "owner" as any,
      name: "Owner",
      isNative: true,
      permissions: [],
    });

    const reconciled = reconcileOwnerRole(ownerRole);
    // Plugin capabilities are auto-prefixed with plugin:id: namespace for isolation
    expect(reconciled.permissions).toContain("plugin:test-plugin:custom:perm");
  });
});

describe("Role Reconciliation — reconcileBuiltinRoles", () => {
  beforeEach(() => {
    capabilityRegistry.clear();
  });

  it("should reconcile only the owner role, not admin/editor", () => {
    const ownerRole = createRole({
      _id: "owner" as any,
      name: "Owner",
      isNative: true,
      permissions: ["collection:read"],
    });
    const adminRole = createRole({
      _id: "admin" as any,
      name: "Administrator",
      isNative: true,
      permissions: ["collection:read"],
    });
    const editorRole = createRole({
      _id: "editor" as any,
      name: "Editor",
      permissions: ["collection:read"],
    });

    const reconciled = reconcileBuiltinRoles([ownerRole, adminRole, editorRole], "owner");

    // Owner should have been expanded
    expect(reconciled[0].permissions.length).toBeGreaterThan(1);

    // Admin should be left unchanged (operators may have narrowed it)
    expect(reconciled[1].permissions).toEqual(["collection:read"]);

    // Editor should be left unchanged
    expect(reconciled[2].permissions).toEqual(["collection:read"]);
  });

  it("should match owner by name when _id mismatch occurs", () => {
    const ownerRole = createRole({
      _id: "custom-id" as any,
      name: "Owner",
      isNative: true,
      permissions: ["collection:read"],
    });

    const reconciled = reconcileBuiltinRoles([ownerRole], "owner");

    // Should still reconcile because name === "Owner" and isNative
    expect(reconciled[0].permissions.length).toBeGreaterThan(1);
  });
});

describe("Role Reconciliation — isOwnerRole / findOwnerRole", () => {
  it("should identify owner role by isNative + name", () => {
    const owner = createRole({
      _id: "owner" as any,
      name: "Owner",
      isNative: true,
    });
    const admin = createRole({
      _id: "admin" as any,
      name: "Administrator",
      isNative: true,
    });

    expect(isOwnerRole(owner)).toBe(true);
    expect(isOwnerRole(admin)).toBe(false);
  });

  it("should find owner role in a list", () => {
    const owner = createRole({
      _id: "owner" as any,
      name: "Owner",
      isNative: true,
    });
    const admin = createRole({
      _id: "admin" as any,
      name: "Administrator",
    });

    const found = findOwnerRole([admin, owner]);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Owner");
  });

  it("should return undefined when no owner role exists", () => {
    const admin = createRole({ name: "Administrator" });
    expect(findOwnerRole([admin])).toBeUndefined();
  });
});
