/**
 * @file tests/unit/content/content-validation.test.ts
 * @description Unit tests for the single-pass `prepareCollectionFields` write-path
 * preparation: sanitization, maxLength constraints, and null-row stripping.
 *
 * Features tested:
 * - String field maxLength validation with default and custom limits
 * - Null/undefined value preservation
 * - Non-string and non-string-type field bypass
 * - Array null row stripping for array/block/repeater/group widget fields
 * - Widget-based array detection (blocks, group, repeater)
 * - Lazy cloning, zero-cost flagless path, and no-mutation guarantees
 */

import { describe, it, expect } from "vitest";
import { prepareCollectionFields } from "@src/content/content-utils";

// ─────────────────────────────────────────────────────────────
// maxLength constraints
// ─────────────────────────────────────────────────────────────

describe("prepareCollectionFields — maxLength constraints", () => {
  const constraints = { constraints: true } as const;

  it("truncates a string to default maxLength 255 when no custom maxLength is set", () => {
    const longString = "a".repeat(300);
    const schema = { fields: [{ db_fieldName: "title", type: "string" }] };
    const data = { title: longString };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.title).toHaveLength(255);
    expect(result.title).toBe(longString.slice(0, 255));
  });

  it("truncates a string to the custom maxLength when specified", () => {
    const longString = "a".repeat(50);
    const schema = {
      fields: [{ db_fieldName: "title", type: "string", maxLength: 10 }],
    };
    const data = { title: longString };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.title).toHaveLength(10);
    expect(result.title).toBe(longString.slice(0, 10));
  });

  it("does not truncate when the value is under the maxLength limit", () => {
    const value = "Hello World";
    const schema = {
      fields: [{ db_fieldName: "title", type: "string", maxLength: 100 }],
    };
    const data = { title: value };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.title).toBe(value);
  });

  it("passes non-string values (number) through unchanged", () => {
    const schema = { fields: [{ db_fieldName: "count", type: "number" }] };
    const data = { count: 42 };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.count).toBe(42);
  });

  it("passes non-string values (boolean) through unchanged", () => {
    const schema = { fields: [{ db_fieldName: "active", type: "boolean" }] };
    const data = { active: true };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.active).toBe(true);
  });

  it("does NOT apply maxLength to fields with non-string types like 'number'", () => {
    const longString = "a".repeat(300);
    const schema = {
      fields: [{ db_fieldName: "count", type: "number", maxLength: 10 }],
    };
    const data = { count: longString };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.count).toBe(longString);
  });

  it("applies maxLength to recognized string-like types (text, textarea, slug, email, url, password)", () => {
    const stringTypes = ["text", "textarea", "slug", "email", "url", "password"];
    const longValue = "a".repeat(300);
    for (const type of stringTypes) {
      const schema = { fields: [{ db_fieldName: "field1", type }] };
      const data = { field1: longValue };
      const result = prepareCollectionFields(data, schema, constraints);
      expect(result.field1).toHaveLength(255);
    }
  });

  it("returns data unchanged when the schema has no fields", () => {
    const data = { title: "Hello", count: 42 };
    const result = prepareCollectionFields(data, {}, constraints);
    expect(result).toEqual(data);
    expect(result).toBe(data);
  });

  it("preserves null values in data", () => {
    const schema = { fields: [{ db_fieldName: "title", type: "string" }] };
    const data = { title: null };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.title).toBeNull();
  });

  it("preserves undefined values in data", () => {
    const schema = { fields: [{ db_fieldName: "title", type: "string" }] };
    const data: Record<string, unknown> = { title: undefined };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.title).toBeUndefined();
  });

  it("handles multiple fields each with their own maxLength", () => {
    const longTitle = "a".repeat(300);
    const longDesc = "b".repeat(20);
    const schema = {
      fields: [
        { db_fieldName: "title", type: "string" },
        { db_fieldName: "description", type: "text", maxLength: 10 },
      ],
    };
    const data = { title: longTitle, description: longDesc };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.title).toHaveLength(255);
    expect(result.description).toHaveLength(10);
  });

  it("does not mutate the original data object", () => {
    const longString = "a".repeat(300);
    const schema = { fields: [{ db_fieldName: "title", type: "string" }] };
    const data = { title: longString };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.title).toHaveLength(255);
    expect(data.title).toBe(longString);
    expect(data.title).toHaveLength(300);
  });

  it("uses default 255 when maxLength is explicitly undefined", () => {
    const longString = "a".repeat(300);
    const schema = {
      fields: [{ db_fieldName: "title", type: "string", maxLength: undefined }],
    };
    const data = { title: longString };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.title).toHaveLength(255);
  });
});

// ─────────────────────────────────────────────────────────────
// null-row stripping
// ─────────────────────────────────────────────────────────────

describe("prepareCollectionFields — null-row stripping", () => {
  const constraints = { constraints: true } as const;

  it("removes null and undefined entries from array fields", () => {
    const schema = { fields: [{ db_fieldName: "items", type: "array" }] };
    const data = { items: [1, null, 2, undefined, 3] };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.items).toEqual([1, 2, 3]);
  });

  it("leaves clean arrays unchanged", () => {
    const schema = { fields: [{ db_fieldName: "items", type: "array" }] };
    const data = { items: [1, 2, 3] };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.items).toEqual([1, 2, 3]);
  });

  it("ignores non-array fields (string)", () => {
    const schema = { fields: [{ db_fieldName: "title", type: "string" }] };
    const data = { title: "Hello World" };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.title).toBe("Hello World");
  });

  it("ignores non-array fields (number)", () => {
    const schema = { fields: [{ db_fieldName: "count", type: "number" }] };
    const data = { count: 42 };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.count).toBe(42);
  });

  it("does NOT strip arrays on fields not marked as an array type", () => {
    const schema = { fields: [{ db_fieldName: "data", type: "string" }] };
    const data = { data: [1, null, 3] };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.data).toEqual([1, null, 3]);
  });

  it("strips nulls based on widget name ('blocks') even without an explicit type", () => {
    const schema = {
      fields: [{ db_fieldName: "content", widget: { Name: "blocks" } }],
    };
    const data = { content: [{ id: 1 }, null, { id: 2 }] };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.content).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("strips nulls based on widget name ('group')", () => {
    const schema = {
      fields: [{ db_fieldName: "groupData", widget: { Name: "group" } }],
    };
    const data = { groupData: [null, { val: 1 }] };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.groupData).toEqual([{ val: 1 }]);
  });

  it("strips nulls based on widget name ('repeater')", () => {
    const schema = {
      fields: [{ db_fieldName: "rows", widget: { Name: "repeater" } }],
    };
    const data = { rows: [{ a: 1 }, null, undefined, { b: 2 }] };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.rows).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("returns an empty array for a field where all entries are null", () => {
    const schema = { fields: [{ db_fieldName: "items", type: "array" }] };
    const data = { items: [null, null, null] };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.items).toEqual([]);
  });

  it("preserves an already empty array", () => {
    const schema = { fields: [{ db_fieldName: "items", type: "array" }] };
    const data = { items: [] };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.items).toEqual([]);
  });

  it("returns data unchanged when the schema has no fields", () => {
    const data = { items: [1, null, 2] };
    const result = prepareCollectionFields(data, {}, constraints);
    expect(result).toEqual(data);
    expect(result).toBe(data);
  });

  it("does not mutate the original data object", () => {
    const schema = { fields: [{ db_fieldName: "items", type: "array" }] };
    const data = { items: [1, null, 2] };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.items).toEqual([1, 2]);
    expect(data.items).toEqual([1, null, 2]);
  });

  it("handles multiple array fields independently", () => {
    const schema = {
      fields: [
        { db_fieldName: "tags", type: "array" },
        { db_fieldName: "blocks", type: "blocks" },
      ],
    };
    const data = {
      tags: ["a", null, "b"],
      blocks: [{ x: 1 }, null],
    };
    const result = prepareCollectionFields(data, schema, constraints);
    expect(result.tags).toEqual(["a", "b"]);
    expect(result.blocks).toEqual([{ x: 1 }]);
  });
});

// ─────────────────────────────────────────────────────────────
// single-pass flags & lazy cloning
// ─────────────────────────────────────────────────────────────

describe("prepareCollectionFields", () => {
  it("returns data by reference when flags are omitted (zero cost)", () => {
    const schema = { fields: [{ db_fieldName: "title", type: "string" }] };
    const data = { title: "Hello" };
    expect(prepareCollectionFields(data, schema)).toBe(data);
  });

  it("returns data by reference when both flags are false", () => {
    const schema = { fields: [{ db_fieldName: "title", type: "string" }] };
    const data = { title: "Hello" };
    expect(prepareCollectionFields(data, schema, {})).toBe(data);
    expect(prepareCollectionFields(data, schema, { sanitize: false, constraints: false })).toBe(
      data,
    );
  });

  it("returns data by reference when nothing changed under both flags", () => {
    const schema = {
      fields: [
        { db_fieldName: "title", type: "string" },
        { db_fieldName: "items", type: "array" },
      ],
    };
    const data = { title: "Clean", items: [1, 2, 3] };
    expect(prepareCollectionFields(data, schema, { sanitize: true, constraints: true })).toBe(data);
  });

  it("sanitizes richtext/markdown with sanitizeHtml and text/textarea with stripHtml", () => {
    const schema = {
      fields: [
        { db_fieldName: "body", type: "richtext" },
        { db_fieldName: "notes", type: "textarea" },
      ],
    };
    const data = {
      body: "<p>Hi</p><script>alert(1)</script>",
      notes: "Plain <b>text</b>",
    };
    const result = prepareCollectionFields(data, schema, { sanitize: true });
    expect(result.body).toContain("<p>Hi</p>");
    expect(result.body).not.toContain("script");
    expect(result.notes).toBe("Plain text");
  });

  it("does not sanitize when only the constraints flag is set", () => {
    const schema = { fields: [{ db_fieldName: "body", type: "richtext" }] };
    const data = { body: "<script>alert(1)</script>" };
    const result = prepareCollectionFields(data, schema, { constraints: true });
    expect(result.body).toBe("<script>alert(1)</script>");
  });

  it("does not truncate when only the sanitize flag is set", () => {
    const longString = "a".repeat(300);
    const schema = { fields: [{ db_fieldName: "title", type: "text" }] };
    const result = prepareCollectionFields({ title: longString }, schema, { sanitize: true });
    expect(result.title).toHaveLength(300);
  });

  it("applies sanitize before truncation on text fields (combined flags)", () => {
    const schema = { fields: [{ db_fieldName: "notes", type: "textarea", maxLength: 10 }] };
    const data = { notes: "<b>Hello World</b>" };
    const result = prepareCollectionFields(data, schema, {
      sanitize: true,
      constraints: true,
    });
    expect(result.notes).toBe("Hello Worl");
  });
});
