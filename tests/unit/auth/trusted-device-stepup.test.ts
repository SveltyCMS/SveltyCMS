/**
 * @file tests/unit/auth/trusted-device-stepup.test.ts
 * @description Unit tests for trusted-device session elevation and step-up MFA enforcement.
 */

import { describe, it, expect } from "vitest";
import { checkMfaRequirement } from "@src/hooks/handle-authorization";
import { AppError } from "@utils/error-handling";
import type { Role } from "@src/databases/auth/types";

describe("Trusted Device Session Elevation & Step-Up Auth", () => {
  const mfaRole: Role = {
    _id: "role_admin" as any,
    name: "Admin",
    permissions: ["admin"],
    mfaRequired: true,
  };

  const userWith2Fa = {
    _id: "user_123",
    email: "admin@example.com",
    is2FAEnabled: true,
  };

  it("permits high-privilege operations when session has interactive MFA", () => {
    expect(() => {
      checkMfaRequirement(userWith2Fa, mfaRole, "/api/system/settings", true, ["pwd", "mfa"]);
    }).not.toThrow();
  });

  it("blocks high-privilege API operations with STEP_UP_MFA_REQUIRED when session has trusted_device AMR only", () => {
    expect(() => {
      checkMfaRequirement(userWith2Fa, mfaRole, "/api/system/settings", true, [
        "pwd",
        "trusted_device",
      ]);
    }).toThrowError(AppError);

    try {
      checkMfaRequirement(userWith2Fa, mfaRole, "/api/system/settings", true, [
        "pwd",
        "trusted_device",
      ]);
    } catch (err: any) {
      expect(err.code).toBe("STEP_UP_MFA_REQUIRED");
      expect(err.status).toBe(403);
    }
  });

  it("redirects page requests to stepup prompt when session has trusted_device AMR only", () => {
    try {
      checkMfaRequirement(userWith2Fa, mfaRole, "/api/user/roles", false, [
        "pwd",
        "trusted_device",
      ]);
    } catch (err: any) {
      expect(err.status).toBe(302);
      expect(err.location).toBe("/user?tab=security&stepup=required");
    }
  });

  it("permits standard content operations for trusted_device sessions", () => {
    expect(() => {
      checkMfaRequirement(userWith2Fa, mfaRole, "/api/collections/posts", true, [
        "pwd",
        "trusted_device",
      ]);
    }).not.toThrow();
  });

  it("always permits exempt paths like /user and /logout regardless of AMR level", () => {
    expect(() => {
      checkMfaRequirement(userWith2Fa, mfaRole, "/user", false, ["pwd", "trusted_device"]);
    }).not.toThrow();

    expect(() => {
      checkMfaRequirement(userWith2Fa, mfaRole, "/api/auth/logout", true, [
        "pwd",
        "trusted_device",
      ]);
    }).not.toThrow();
  });
});
