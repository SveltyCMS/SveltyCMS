/**
 * @file tests/unit/security/user-attribute-policy.test.ts
 * @description Regression tests for privilege-escalation defense on user attribute updates.
 *
 * Ensures role/isAdmin and other security fields cannot ride along profile patches
 * from low-privileged callers (CVE-class: broken authorization on update-user-attributes).
 */

import { describe, it, expect } from "vitest";
import {
  hasPrivilegeEscalationFields,
  hasPrivilegedUserFields,
  isAdminCaller,
  sanitizeClientUserAttributePatch,
  stripPrivilegeEscalationFields,
  stripPrivilegedUserFields,
  PRIVILEGED_USER_FIELDS,
  PRIVILEGE_ESCALATION_FIELDS,
} from "../../../src/utils/security/user-attribute-policy";

describe("user-attribute-policy — privilege escalation defense", () => {
  it("lists core privilege fields", () => {
    expect(PRIVILEGED_USER_FIELDS).toContain("role");
    expect(PRIVILEGED_USER_FIELDS).toContain("isAdmin");
    expect(PRIVILEGED_USER_FIELDS).toContain("permissions");
    expect(PRIVILEGED_USER_FIELDS).toContain("roleIds");
    expect(PRIVILEGED_USER_FIELDS).toContain("blocked");
    expect(PRIVILEGE_ESCALATION_FIELDS).toEqual(["role", "isAdmin", "roleIds", "permissions"]);
  });

  it("detects privileged fields in a client payload", () => {
    expect(hasPrivilegedUserFields({ username: "a", role: "admin" })).toBe(true);
    expect(hasPrivilegedUserFields({ isAdmin: true })).toBe(true);
    expect(hasPrivilegedUserFields({ username: "safe", email: "a@b.c" })).toBe(false);
    expect(hasPrivilegeEscalationFields({ role: "admin", username: "x" })).toBe(true);
    expect(hasPrivilegeEscalationFields({ failedAttempts: 0 })).toBe(false);
  });

  it("strips role and isAdmin while preserving profile fields", () => {
    const patch = {
      username: "guest",
      firstName: "Low",
      role: "admin",
      isAdmin: true,
      permissions: ["*"],
      roleIds: ["admin"],
      preferences: { rtc: { sound: true } },
    };
    const cleaned = stripPrivilegedUserFields(patch);
    expect(cleaned.username).toBe("guest");
    expect(cleaned.firstName).toBe("Low");
    expect(cleaned.preferences).toEqual({ rtc: { sound: true } });
    expect(cleaned).not.toHaveProperty("role");
    expect(cleaned).not.toHaveProperty("isAdmin");
    expect(cleaned).not.toHaveProperty("permissions");
    expect(cleaned).not.toHaveProperty("roleIds");
  });

  it("escalation-only strip keeps lockout fields for internal auth", () => {
    const patch = {
      role: "admin",
      isAdmin: true,
      failedAttempts: 3,
      lockoutUntil: "2026-01-01T00:00:00.000Z",
    };
    stripPrivilegeEscalationFields(patch);
    expect(patch).not.toHaveProperty("role");
    expect(patch).not.toHaveProperty("isAdmin");
    expect(patch.failedAttempts).toBe(3);
    expect(patch.lockoutUntil).toBe("2026-01-01T00:00:00.000Z");
  });

  it("strips lockout / 2FA / identity fields", () => {
    const patch = {
      email: "user@example.com",
      failedAttempts: 0,
      lockoutUntil: null,
      totpSecret: "SECRET",
      backupCodes: ["a"],
      emailVerified: true,
      tenantId: "other-tenant",
      _id: "forged-id",
    };
    stripPrivilegedUserFields(patch);
    expect(patch.email).toBe("user@example.com");
    expect(patch).not.toHaveProperty("failedAttempts");
    expect(patch).not.toHaveProperty("lockoutUntil");
    expect(patch).not.toHaveProperty("totpSecret");
    expect(patch).not.toHaveProperty("backupCodes");
    expect(patch).not.toHaveProperty("emailVerified");
    expect(patch).not.toHaveProperty("tenantId");
    expect(patch).not.toHaveProperty("_id");
  });

  it("leaves password and locale for self-service profile updates", () => {
    const patch = {
      password: "NewSecure1!",
      locale: "de",
      avatar: "/files/avatar.png",
    };
    stripPrivilegedUserFields(patch);
    expect(patch).toEqual({
      password: "NewSecure1!",
      locale: "de",
      avatar: "/files/avatar.png",
    });
  });

  it("sanitizeClientUserAttributePatch strips for non-admin, keeps role for admin", () => {
    const raw = {
      user_id: "self",
      role: "admin",
      isAdmin: true,
      username: "x",
      currentPassword: "unused",
    };
    const nonAdmin = sanitizeClientUserAttributePatch(raw, { isAdmin: false });
    expect(nonAdmin).toEqual({ username: "x" });
    const admin = sanitizeClientUserAttributePatch({ ...raw }, { isAdmin: true });
    expect(admin.role).toBe("admin");
    expect(admin.isAdmin).toBe(true);
    expect(admin.username).toBe("x");
    expect(admin).not.toHaveProperty("user_id");
    expect(admin).not.toHaveProperty("currentPassword");
  });

  it("isAdminCaller recognizes admin and super-admin", () => {
    expect(isAdminCaller({ isAdmin: true })).toBe(true);
    expect(isAdminCaller({ role: "admin" })).toBe(true);
    expect(isAdminCaller({ role: "super-admin" })).toBe(true);
    expect(isAdminCaller({ role: "editor", isAdmin: false })).toBe(false);
    expect(isAdminCaller(null)).toBe(false);
  });
});
