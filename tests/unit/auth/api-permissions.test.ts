/**
 * @file tests/unit/auth/api-permissions.test.ts
 * @description Unit tests for API permissions RBAC evaluation (hasApiPermission).
 *
 * Validates:
 * - Admin bypass (via flag or role name)
 * - Direct O(1) map resolution for standard endpoints
 * - Wildcard (*) permissions for authenticated users
 * - Role-matching with single string or array of roles
 * - Hierarchical / nested route fallback via Trie
 * - Fail-closed behavior for unknown or unauthorized endpoints
 */

import { describe, it, expect } from "vitest";
import { hasApiPermission } from "@src/databases/auth/api-permissions";

describe("hasApiPermission RBAC evaluation", () => {
  it("grants access unconditionally when isAdmin flag is true", () => {
    expect(hasApiPermission("guest", "config", true)).toBe(true);
    expect(hasApiPermission([], "unknown-endpoint", true)).toBe(true);
  });

  it("grants access unconditionally when user role is admin", () => {
    expect(hasApiPermission("admin", "config")).toBe(true);
    expect(hasApiPermission(["admin"], "settings")).toBe(true);
    expect(hasApiPermission(["editor", "admin"], "api-keys")).toBe(true);
  });

  it("allows wildcard endpoints for any authenticated role", () => {
    expect(hasApiPermission("author", "auth")).toBe(true);
    expect(hasApiPermission("viewer", "events")).toBe(true);
    expect(hasApiPermission(["guest"], "testing")).toBe(true);
  });

  it("allows authorized roles for multi-role endpoints", () => {
    expect(hasApiPermission("editor", "collections")).toBe(true);
    expect(hasApiPermission("editor", "user")).toBe(true);
    expect(hasApiPermission(["editor"], "media")).toBe(true);
  });

  it("denies access when user role is not permitted", () => {
    expect(hasApiPermission("author", "collections")).toBe(false);
    expect(hasApiPermission("editor", "config")).toBe(false);
    expect(hasApiPermission("editor", "api-keys")).toBe(false);
    expect(hasApiPermission(["viewer", "guest"], "user")).toBe(false);
  });

  it("resolves nested endpoints with wildcards and specific roles", () => {
    expect(hasApiPermission("guest", "system/health")).toBe(true);
    expect(hasApiPermission("viewer", "settings/public")).toBe(true);
    expect(hasApiPermission("editor", "system")).toBe(true);
  });

  it("fails closed (denies access) for undefined/unknown endpoints", () => {
    expect(hasApiPermission("editor", "completely-unknown-route")).toBe(false);
    expect(hasApiPermission("author", "non-existent")).toBe(false);
    expect(hasApiPermission([], "collections")).toBe(false);
  });
});
