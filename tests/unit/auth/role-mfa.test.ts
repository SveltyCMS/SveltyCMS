/**
 * @file tests/unit/auth/role-mfa.test.ts
 * @description Unit tests for per-role MFA enforcement (mfaRequired) and session AMR tracking.
 */

import { describe, it, expect } from "vitest";
import type { Role, Session, User } from "@src/databases/auth/types";
import { checkMfaRequirement } from "@src/hooks/handle-authorization";
import { AppError } from "@utils/error-handling";

describe("Per-Role MFA Enforcement & Session AMR", () => {
  it("Role interface supports mfaRequired attribute", () => {
    const role: Role = {
      _id: "role_editor" as any,
      name: "Editor",
      permissions: ["posts:write"],
      mfaRequired: true,
    };
    expect(role.mfaRequired).toBe(true);
  });

  it("Session interface supports amr (Authentication Method References)", () => {
    const session: Session = {
      _id: "sess_123" as any,
      user_id: "user_456" as any,
      expires: new Date(Date.now() + 3600000).toISOString() as any,
      amr: ["pwd", "mfa"],
    };
    expect(session.amr).toEqual(["pwd", "mfa"]);
  });

  describe("checkMfaRequirement gate", () => {
    it("permits users whose role does not require MFA", () => {
      const user: Partial<User> = {
        _id: "u1" as any,
        email: "author@example.com",
        is2FAEnabled: false,
      };
      const role: Role = {
        _id: "author" as any,
        name: "Author",
        permissions: [],
        mfaRequired: false,
      };

      expect(() => {
        checkMfaRequirement(user, role, "/api/posts", true);
      }).not.toThrow();
    });

    it("blocks API requests with 403 AppError when role requires MFA but user has not enrolled", () => {
      const user: Partial<User> = {
        _id: "u2" as any,
        email: "editor@example.com",
        is2FAEnabled: false,
      };
      const role: Role = {
        _id: "editor" as any,
        name: "Editor",
        permissions: [],
        mfaRequired: true,
      };

      try {
        checkMfaRequirement(user, role, "/api/collections", true);
        expect.unreachable("Should have thrown 403 AppError");
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.status).toBe(403);
        expect(err.code).toBe("MFA_REQUIRED");
      }
    });

    it("redirects page requests to /user?tab=security when role requires MFA but user has not enrolled", () => {
      const user: Partial<User> = {
        _id: "u3" as any,
        email: "editor@example.com",
        is2FAEnabled: false,
      };
      const role: Role = {
        _id: "editor" as any,
        name: "Editor",
        permissions: [],
        mfaRequired: true,
      };

      try {
        checkMfaRequirement(user, role, "/collections", false);
        expect.unreachable("Should have redirected");
      } catch (err: any) {
        expect(err.status).toBe(302);
        expect(err.location).toBe("/user?tab=security&mfa=required");
      }
    });

    it("exempts 2FA setup and profile routes so user can enroll in MFA", () => {
      const user: Partial<User> = {
        _id: "u4" as any,
        email: "editor@example.com",
        is2FAEnabled: false,
      };
      const role: Role = {
        _id: "editor" as any,
        name: "Editor",
        permissions: [],
        mfaRequired: true,
      };

      expect(() => {
        checkMfaRequirement(user, role, "/api/auth/2fa/setup", true);
        checkMfaRequirement(user, role, "/user?tab=security", false);
        checkMfaRequirement(user, role, "/logout", false);
        checkMfaRequirement(user, role, "/api/auth/logout", true);
      }).not.toThrow();
    });

    it("permits users whose role requires MFA when user has 2FA enabled", () => {
      const user: Partial<User> = {
        _id: "u5" as any,
        email: "editor@example.com",
        is2FAEnabled: true,
      };
      const role: Role = {
        _id: "editor" as any,
        name: "Editor",
        permissions: [],
        mfaRequired: true,
      };

      expect(() => {
        checkMfaRequirement(user, role, "/api/collections", true);
        checkMfaRequirement(user, role, "/collections", false);
      }).not.toThrow();
    });
  });
});
