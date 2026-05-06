/**
 * @file tests/unit/widgets/core/email.test.ts
 * @description Unit tests for the Email widget
 */

import { describe, it, expect } from "vitest";
import EmailWidget from "@widgets/core/email";
import { safeParse } from "valibot";

describe("Email Widget", () => {
  it("should validate a correct email address", () => {
    const field = EmailWidget({ label: "Email" });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "test@example.com").success).toBe(true);
    expect(safeParse(schema, "user.name+suffix@domain.co.uk").success).toBe(true);
  });

  it("should reject invalid email formats", () => {
    const field = EmailWidget({ label: "Email" });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "invalid-email").success).toBe(false);
    expect(safeParse(schema, "@example.com").success).toBe(false);
    expect(safeParse(schema, "test@").success).toBe(false);
  });

  it("should reject disposable email addresses", () => {
    const field = EmailWidget({ label: "Email" });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "user@mailinator.com").success).toBe(false);
    expect(safeParse(schema, "test@tempmail.com").success).toBe(false);
  });

  it("should handle required constraint", () => {
    const requiredField = EmailWidget({ label: "Email", required: true });
    const optionalField = EmailWidget({ label: "Email", required: false });

    const reqSchema = (requiredField.widget.validationSchema as any)(requiredField);
    const optSchema = (optionalField.widget.validationSchema as any)(optionalField);

    expect(safeParse(reqSchema, "").success).toBe(false);
    expect(safeParse(reqSchema, null).success).toBe(false);
    expect(safeParse(optSchema, null).success).toBe(true);
  });
});
