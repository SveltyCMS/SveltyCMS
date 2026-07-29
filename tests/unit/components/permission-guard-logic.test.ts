/**
 * @file tests/unit/components/permission-guard-logic.test.ts
 * @description Pure logic tests mirroring PermissionGuard allow/deny rules
 * (config contextId + isAdmin + bulkDelete). Component itself is Svelte UI.
 */

import { describe, it, expect } from "vitest";

type PermEntry = { hasPermission?: boolean } | boolean | undefined;

function isAllowed(options: {
  action?: string;
  disableBulkDelete?: boolean;
  configContextId?: string;
  permissions?: Record<string, PermEntry>;
  isAdmin?: boolean;
}): boolean {
  const action = options.action ?? "bulkDelete";
  if (action === "bulkDelete" && options.disableBulkDelete === true) {
    return false;
  }

  if (options.configContextId) {
    const entry = options.permissions?.[options.configContextId];
    if (typeof entry === "boolean") return entry;
    if (entry && typeof entry.hasPermission === "boolean") {
      return entry.hasPermission === true;
    }
    if (options.isAdmin === true) return true;
    return false;
  }

  return true;
}

describe("PermissionGuard allow rules", () => {
  it("allows when no config (legacy collection-only)", () => {
    expect(isAllowed({})).toBe(true);
  });

  it("denies bulkDelete when collection disables it", () => {
    expect(isAllowed({ action: "bulkDelete", disableBulkDelete: true })).toBe(false);
  });

  it("grants when permissions map has hasPermission true", () => {
    expect(
      isAllowed({
        configContextId: "config/adminArea",
        permissions: { "config/adminArea": { hasPermission: true } },
        isAdmin: false,
      }),
    ).toBe(true);
  });

  it("denies when permissions map has hasPermission false", () => {
    expect(
      isAllowed({
        configContextId: "config/adminArea",
        permissions: { "config/adminArea": { hasPermission: false } },
        isAdmin: false,
      }),
    ).toBe(false);
  });

  it("admin fast-path when map entry missing", () => {
    expect(
      isAllowed({
        configContextId: "config/adminArea",
        permissions: {},
        isAdmin: true,
      }),
    ).toBe(true);
  });

  it("fail-closed for non-admin when map entry missing", () => {
    expect(
      isAllowed({
        configContextId: "config/adminArea",
        permissions: {},
        isAdmin: false,
      }),
    ).toBe(false);
  });

  it("accepts boolean permission entries", () => {
    expect(
      isAllowed({
        configContextId: "config:extensions",
        permissions: { "config:extensions": true },
      }),
    ).toBe(true);
    expect(
      isAllowed({
        configContextId: "config:extensions",
        permissions: { "config:extensions": false },
        isAdmin: false,
      }),
    ).toBe(false);
  });
});
