/**
 * @file tests/unit/services/ai-builder/validator.test.ts
 * @description Unit tests for structured-output validation of AI proposals.
 *
 * ### Features covered:
 * - shape validation (Valibot) with actionable AppErrors
 * - reserved field-name blocking
 * - field-name and slug convention enforcement
 * - duplicate field-name rejection
 * - widget registry awareness
 */

import { describe, expect, it } from "vitest";
import { AppError } from "@utils/error-handling";
import {
  RESERVED_FIELD_NAMES,
  validateAgainstRegistry,
  validateProposal,
} from "@src/services/ai-builder/validator";
import type { CollectionDesignProposal } from "@src/services/ai-builder/types";

function validRawProposal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Blog Post",
    slug: "blog-post",
    label: "Blog Post",
    description: "A blog post",
    fields: [
      {
        name: "title",
        label: "Title",
        widget: "Input",
        type: "string",
        required: true,
        translated: false,
      },
      { name: "body", widget: "RichText", type: "richtext", required: false },
    ],
    rationale: ["Standard schema"],
    ...overrides,
  };
}

function expectAppError(fn: () => unknown, status: number, code: string): AppError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    const appError = err as AppError;
    expect(appError.status).toBe(status);
    expect(appError.code).toBe(code);
    return appError;
  }
  throw new Error(`Expected AppError ${status} ${code}, but nothing was thrown`);
}

describe("validateProposal", () => {
  it("accepts a valid proposal", () => {
    const proposal = validateProposal(validRawProposal());
    expect(proposal.slug).toBe("blog-post");
    expect(proposal.fields).toHaveLength(2);
    expect(proposal.fields[0]).toMatchObject({ name: "title", widget: "Input" });
  });

  it("rejects non-object output", () => {
    for (const raw of [null, "hello", 42, true, []]) {
      expectAppError(() => validateProposal(raw), 400, "AI_OUTPUT_INVALID");
    }
  });

  it("rejects a proposal without fields", () => {
    const raw = validRawProposal({ fields: undefined });
    expectAppError(() => validateProposal(raw), 400, "AI_OUTPUT_INVALID");
  });

  it("rejects an empty fields array", () => {
    const raw = validRawProposal({ fields: [] });
    expectAppError(() => validateProposal(raw), 400, "AI_OUTPUT_INVALID");
  });

  it("rejects duplicate field names", () => {
    const raw = validRawProposal({
      fields: [
        { name: "title", widget: "Input" },
        { name: "title", widget: "RichText" },
      ],
    });
    const err = expectAppError(() => validateProposal(raw), 400, "AI_OUTPUT_INVALID");
    expect(err.message).toContain("unique");
  });

  it("rejects reserved field names", () => {
    for (const reserved of RESERVED_FIELD_NAMES) {
      const raw = validRawProposal({ fields: [{ name: reserved, widget: "Input" }] });
      expectAppError(() => validateProposal(raw), 400, "AI_OUTPUT_INVALID");
    }
  });

  it("rejects field names violating the camelCase convention", () => {
    for (const name of ["Title", "_leading", "with-dash", "with space", "1leading", "café"]) {
      const raw = validRawProposal({ fields: [{ name, widget: "Input" }] });
      expectAppError(() => validateProposal(raw), 400, "AI_OUTPUT_INVALID");
    }
  });

  it("rejects invalid slugs", () => {
    for (const slug of ["Blog-Post", "blog_post", "blog post", "", "blog.post"]) {
      const raw = validRawProposal({ slug });
      expectAppError(() => validateProposal(raw), 400, "AI_OUTPUT_INVALID");
    }
  });

  it("accepts a slug containing digits and hyphens", () => {
    const proposal = validateProposal(validRawProposal({ slug: "blog-2026-post" }));
    expect(proposal.slug).toBe("blog-2026-post");
  });

  it("rejects an empty widget name", () => {
    const raw = validRawProposal({ fields: [{ name: "title", widget: "" }] });
    expectAppError(() => validateProposal(raw), 400, "AI_OUTPUT_INVALID");
  });

  it("rejects missing name and label", () => {
    const raw = validRawProposal({ name: "", label: "" });
    expectAppError(() => validateProposal(raw), 400, "AI_OUTPUT_INVALID");
  });
});

describe("RESERVED_FIELD_NAMES", () => {
  it("contains the required system field names", () => {
    for (const name of [
      "_id",
      "tenantId",
      "status",
      "isDeleted",
      "createdAt",
      "updatedAt",
      "createdBy",
      "updatedBy",
    ]) {
      expect(RESERVED_FIELD_NAMES.has(name)).toBe(true);
    }
  });
});

describe("validateAgainstRegistry", () => {
  const registry = new Set(["Input", "RichText", "Slug"]);

  const proposal: CollectionDesignProposal = {
    name: "Blog Post",
    slug: "blog-post",
    label: "Blog Post",
    fields: [
      { name: "title", widget: "Input" },
      { name: "body", widget: "RichText" },
    ],
  };

  const lookup = (name: string) => (registry.has(name) ? { Name: name } : undefined);

  it("passes when every widget is known", () => {
    expect(() => validateAgainstRegistry(proposal, lookup)).not.toThrow();
  });

  it("throws VALIDATION_FAILED for unknown widgets, deduplicated", () => {
    const bad: CollectionDesignProposal = {
      ...proposal,
      fields: [
        { name: "a", widget: "Ghost" },
        { name: "b", widget: "Ghost" },
        { name: "c", widget: "Phantom" },
      ],
    };
    const err = expectAppError(
      () => validateAgainstRegistry(bad, lookup),
      400,
      "VALIDATION_FAILED",
    );
    expect(err.message).toContain("Ghost");
    expect(err.message).toContain("Phantom");
    expect(err.message.match(/Ghost/g)).toHaveLength(1);
  });
});
