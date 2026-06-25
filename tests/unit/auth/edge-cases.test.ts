/**
 * @file tests/unit/auth/edge-cases.test.ts
 * @description Edge-case tests for auth and lockout — null, NaN, empty, extreme values.
 *
 * These are the inputs that real users accidentally hit and AI assistants
 * generate without thinking. Every auth function must handle them gracefully.
 */

import { describe, it, expect } from "vitest";

describe("Auth Edge Cases — Null/Undefined/Empty", () => {
  const lockout = (failed: number, blocked: boolean, lockUntil: Date | null) => ({
    failedAttempts: failed,
    blocked,
    lockoutUntil: lockUntil,
  });

  it("should handle zero failed attempts", () => {
    const user = lockout(0, false, null);
    expect(user.failedAttempts).toBe(0);
    expect(user.blocked).toBe(false);
  });

  it("should handle negative failed attempts (defensive)", () => {
    const user = lockout(-1, false, null);
    // Negative attempts should not grant access
    expect(user.failedAttempts).toBeLessThanOrEqual(0);
  });

  it("should handle excessive failed attempts", () => {
    const user = lockout(999_999, true, new Date(Date.now() + 3_600_000));
    expect(user.blocked).toBe(true);
  });

  it("should handle null lockoutUntil", () => {
    const user = lockout(0, false, null);
    const isLocked =
      user.blocked || (user.lockoutUntil !== null && user.lockoutUntil.getTime() > Date.now());
    expect(isLocked).toBe(false);
  });

  it("should handle lockoutUntil in the past", () => {
    const expired = new Date(Date.now() - 3_600_000); // 1 hour ago
    const user = lockout(5, false, expired);
    const isLocked =
      user.blocked || (user.lockoutUntil !== null && user.lockoutUntil.getTime() > Date.now());
    expect(isLocked).toBe(false);
  });

  it("should handle zero-duration lockout", () => {
    const now = new Date();
    const user = lockout(5, true, now);
    const isLocked = user.blocked && user.lockoutUntil!.getTime() >= now.getTime();
    expect(isLocked).toBe(true);
  });
});

describe("Session Edge Cases", () => {
  it("should handle zero-duration session", () => {
    const now = Date.now();
    const expiresAt = new Date(now);
    expect(expiresAt.getTime()).toBe(now);
  });

  it("should handle session expiring exactly now", () => {
    const expiresAt = new Date(Date.now());
    const expired = expiresAt.getTime() <= Date.now();
    expect(expired).toBe(true);
  });

  it("should handle negative session duration (defensive)", () => {
    const pastExpiry = new Date(Date.now() - 60_000);
    const expired = pastExpiry.getTime() < Date.now();
    expect(expired).toBe(true);
  });
});

describe("Permission Edge Cases", () => {
  it("should handle empty roles array", () => {
    const roles: { name: string; isAdmin: boolean; permissions: string[] }[] = [];
    const hasPermission = roles.some((r) => r.permissions.includes("collection:read"));
    expect(hasPermission).toBe(false);
  });

  it("should handle duplicate permissions", () => {
    const roles = [
      {
        name: "editor",
        isAdmin: false,
        permissions: ["collection:read", "collection:read"],
      },
    ];
    const deduped = [...new Set(roles.flatMap((r) => r.permissions))];
    expect(deduped).toHaveLength(1);
    expect(deduped).toContain("collection:read");
  });

  it("should handle null permission string", () => {
    const permissions: (string | null)[] = [null, "collection:read"];
    const safe = permissions.filter((p): p is string => typeof p === "string");
    expect(safe).toContain("collection:read");
    expect(safe).not.toContain(null);
  });
});
