/**
 * @file tests/unit/user/form-validation.test.ts
 * @description White-box unit tests for editUserSchema validation rules.
 *
 * Covers: username constraints, email validation, password mismatch,
 * optional fields, and edge cases around the editUserSchema Valibot schema.
 */

import { describe, it, expect } from "vitest";
import { safeParse } from "valibot";
import { editUserSchema } from "@src/utils/schemas";

describe("editUserSchema", () => {
  // ---------------------------------------------------------------------------
  // VALID INPUTS
  // ---------------------------------------------------------------------------

  it("should accept a minimal valid payload", () => {
    const result = safeParse(editUserSchema, { user_id: "u1", username: "ab", email: "a@b.co" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.email).toBe("a@b.co");
    }
  });

  it("should accept all optional fields set", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "testuser",
      email: "t@t.com",
      role: "editor",
      password: "secret123!A",
      confirmPassword: "secret123!A",
      currentPassword: "oldpass",
    });
    expect(result.success).toBe(true);
  });

  it("should accept empty optional fields", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "testuser",
      email: "t@t.com",
      role: "",
      password: "",
      confirmPassword: "",
      currentPassword: "",
    });
    expect(result.success).toBe(true);
  });

  it("should lower-case the email via transform", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "testuser",
      email: "My.Email+Tag@Domain.COM",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.email).toBe("my.email+tag@domain.com");
    }
  });

  it("should trim whitespace from username and email", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "  spaced  ",
      email: "  x@y.com  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.username).toBe("spaced");
      expect(result.output.email).toBe("x@y.com");
    }
  });

  // ---------------------------------------------------------------------------
  // USERNAME VALIDATION
  // ---------------------------------------------------------------------------

  it("should reject username shorter than 2 characters", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "a",
      email: "a@b.com",
    });
    expect(result.success).toBe(false);
  });

  it("should reject username longer than 50 characters", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "a".repeat(51),
      email: "a@b.com",
    });
    expect(result.success).toBe(false);
  });

  it("should accept username at exactly 50 characters (boundary)", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "a".repeat(50),
      email: "a@b.com",
    });
    expect(result.success).toBe(true);
  });

  it("should reject username with spaces", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "user name",
      email: "a@b.com",
    });
    expect(result.success).toBe(false);
  });

  it("should reject username with special chars outside allowed set", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "user<>name",
      email: "a@b.com",
    });
    expect(result.success).toBe(false);
  });

  it("should accept username with allowed special characters", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "user@name!test#check.test_name-ok",
      email: "a@b.com",
    });
    expect(result.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // EMAIL VALIDATION
  // ---------------------------------------------------------------------------

  it("should reject invalid email formats", () => {
    const invalidEmails = ["notanemail", "missing@", "@missing.com", "no@domain", "", " "];
    for (const email of invalidEmails) {
      const result = safeParse(editUserSchema, {
        user_id: "u1",
        username: "testuser",
        email,
      });
      expect(result.success).toBe(false);
    }
  });

  it("should accept valid email formats", () => {
    const validEmails = [
      "simple@example.com",
      "user+tag@domain.co.uk",
      "first.last@sub.domain.org",
      "user@domain.io",
    ];
    for (const email of validEmails) {
      const result = safeParse(editUserSchema, {
        user_id: "u1",
        username: "testuser",
        email,
      });
      expect(result.success).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // PASSWORD VALIDATION (cross-field)
  // ---------------------------------------------------------------------------

  it("should accept when password and confirmPassword are both empty", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "testuser",
      email: "a@b.com",
      password: "",
      confirmPassword: "",
    });
    expect(result.success).toBe(true);
  });

  it("should accept when password and confirmPassword match", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "testuser",
      email: "a@b.com",
      password: "NewPassword1!",
      confirmPassword: "NewPassword1!",
    });
    expect(result.success).toBe(true);
  });

  it("should reject when password and confirmPassword do not match", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "testuser",
      email: "a@b.com",
      password: "Pass123!",
      confirmPassword: "Different456!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // The error should be forwarded to confirmPassword path
      const issuePaths = result.issues.map((i) => i.path?.map((p) => p.key).join("."));
      const hasConfirmPasswordIssue = issuePaths.some((p) => p?.includes("confirmPassword"));
      expect(hasConfirmPasswordIssue).toBe(true);
    }
  });

  it("should accept when only password is set (not confirmPassword) — cross-field check is skipped", () => {
    // The check only fires when both are present and password.length > 0
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "testuser",
      email: "a@b.com",
      password: "secret",
      // confirmPassword not provided
    });
    expect(result.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // MISSING REQUIRED FIELDS
  // ---------------------------------------------------------------------------

  it("should reject when user_id is missing", () => {
    const result = safeParse(editUserSchema, {
      username: "testuser",
      email: "a@b.com",
    });
    expect(result.success).toBe(false);
  });

  it("should reject when username is missing", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      email: "a@b.com",
    });
    expect(result.success).toBe(false);
  });

  it("should reject when email is missing", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "testuser",
    });
    expect(result.success).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // EDGE CASES
  // ---------------------------------------------------------------------------

  it("should reject when username is only whitespace after trim", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "   ",
      email: "a@b.com",
    });
    expect(result.success).toBe(false);
  });

  it("should handle user_id as any string (no additional constraints)", () => {
    const longId = "x".repeat(200);
    const result = safeParse(editUserSchema, {
      user_id: longId,
      username: "testuser",
      email: "a@b.com",
    });
    expect(result.success).toBe(true);
  });

  it("should accept optional role as any string", () => {
    const result = safeParse(editUserSchema, {
      user_id: "u1",
      username: "testuser",
      email: "a@b.com",
      role: "super-custom-role-123",
    });
    expect(result.success).toBe(true);
  });
});
