/**
 * @file tests/unit/content/content-validation.test.ts
 * @description Unit tests for content validation utilities: validateFieldConstraints and stripNullRows.
 *
 * Features tested:
 * - String field maxLength validation with default and custom limits
 * - Null/undefined value preservation
 * - Non-string and non-string-type field bypass
 * - Array null row stripping for array/block/repeater widget fields
 * - Widget-based array detection (blocks, group, repeater)
 */

import { describe, it, expect } from "vitest";
import { validateFieldConstraints, stripNullRows } from "@src/content/content-utils";

// ─────────────────────────────────────────────────────────────
// validateFieldConstraints
// ─────────────────────────────────────────────────────────────

describe("validateFieldConstraints", () => {
  it("should truncate string to default maxLength 255 when no custom maxLength set", () => {
    const longString = "a".repeat(300);
    const schema = {
      fields: [{ db_fieldName: "title", type: "string" }],
    };
    const data = { title: longString };
    const result = validateFieldConstraints(data, schema);
    expect(result.title).toHaveLength(255);
    expect(result.title).toBe(longString.slice(0, 255));
  });

  it("should truncate string to custom maxLength when specified", () => {
    const longString = "a".repeat(50);
    const schema = {
      fields: [{ db_fieldName: "title", type: "string", maxLength: 10 }],
    };
    const data = { title: longString };
    const result = validateFieldConstraints(data, schema);
    expect(result.title).toHaveLength(10);
    expect(result.title).toBe(longString.slice(0, 10));
  });

  it("should not truncate when value is under the maxLength limit", () => {
    const value = "Hello World"; // 11 chars
    const schema = {
      fields: [{ db_fieldName: "title", type: "string", maxLength: 100 }],
    };
    const data = { title: value };
    const result = validateFieldConstraints(data, schema);
    expect(result.title).toBe(value);
  });

  it("should pass non-string values (number) through unchanged", () => {
    const schema = {
      fields: [{ db_fieldName: "count", type: "number" }],
    };
    const data = { count: 42 };
    const result = validateFieldConstraints(data, schema);
    expect(result.count).toBe(42);
  });

  it("should pass non-string values (boolean) through unchanged", () => {
    const schema = {
      fields: [{ db_fieldName: "active", type: "boolean" }],
    };
    const data = { active: true };
    const result = validateFieldConstraints(data, schema);
    expect(result.active).toBe(true);
  });

  it("should NOT apply maxLength to fields with non-string types like 'number'", () => {
    // Field type is 'number' but value is a string — maxLength is NOT applied
    const longString = "a".repeat(300);
    const schema = {
      fields: [{ db_fieldName: "count", type: "number", maxLength: 10 }],
    };
    const data = { count: longString };
    const result = validateFieldConstraints(data, schema);
    // String type is not in STRING_FIELD_TYPES, so maxLength is skipped
    expect(result.count).toBe(longString);
  });

  it("should apply maxLength to recognized string-like types (text, textarea, slug, email, url, password)", () => {
    const longValue = "a".repeat(300);
    const stringTypes = ["text", "textarea", "slug", "email", "url", "password"];
    for (const type of stringTypes) {
      const schema = {
        fields: [{ db_fieldName: "field1", type }],
      };
      const data = { field1: longValue };
      const result = validateFieldConstraints(data, schema);
      expect(result.field1).toHaveLength(255);
    }
  });

  it("should return data unchanged when schema has no fields", () => {
    const data = { title: "Hello", count: 42 };
    const result = validateFieldConstraints(data, {});
    expect(result).toEqual(data);
    // When schema has no fields, the original reference is returned (optimization)
    expect(result).toBe(data);
  });

  it("should preserve null values in data", () => {
    const schema = {
      fields: [{ db_fieldName: "title", type: "string" }],
    };
    const data = { title: null };
    const result = validateFieldConstraints(data, schema);
    expect(result.title).toBeNull();
  });

  it("should preserve undefined values in data", () => {
    const schema = {
      fields: [{ db_fieldName: "title", type: "string" }],
    };
    const data: Record<string, unknown> = { title: undefined };
    const result = validateFieldConstraints(data, schema);
    expect(result.title).toBeUndefined();
  });

  it("should handle multiple fields each with their own maxLength", () => {
    const longTitle = "a".repeat(300);
    const longDesc = "b".repeat(20);
    const schema = {
      fields: [
        { db_fieldName: "title", type: "string" },
        { db_fieldName: "description", type: "text", maxLength: 10 },
      ],
    };
    const data = { title: longTitle, description: longDesc };
    const result = validateFieldConstraints(data, schema);
    expect(result.title).toHaveLength(255);
    expect(result.description).toHaveLength(10);
  });

  it("should not mutate the original data object", () => {
    const longString = "a".repeat(300);
    const schema = {
      fields: [{ db_fieldName: "title", type: "string" }],
    };
    const data = { title: longString };
    const result = validateFieldConstraints(data, schema);
    expect(result.title).toHaveLength(255);
    // Original should remain unchanged
    expect(data.title).toBe(longString);
    expect(data.title).toHaveLength(300);
  });

  it("should use default 255 when maxLength is explicitly undefined", () => {
    const longString = "a".repeat(300);
    const schema = {
      fields: [{ db_fieldName: "title", type: "string", maxLength: undefined }],
    };
    const data = { title: longString };
    const result = validateFieldConstraints(data, schema);
    expect(result.title).toHaveLength(255);
  });
});

// ─────────────────────────────────────────────────────────────
// stripNullRows
// ─────────────────────────────────────────────────────────────

describe("stripNullRows", () => {
  it("should remove null and undefined entries from array fields", () => {
    const schema = {
      fields: [{ db_fieldName: "items", type: "array" }],
    };
    const data = { items: [1, null, 2, undefined, 3] };
    const result = stripNullRows(data, schema);
    expect(result.items).toEqual([1, 2, 3]);
  });

  it("should leave clean arrays unchanged", () => {
    const schema = {
      fields: [{ db_fieldName: "items", type: "array" }],
    };
    const data = { items: [1, 2, 3] };
    const result = stripNullRows(data, schema);
    expect(result.items).toEqual([1, 2, 3]);
  });

  it("should ignore non-array fields (string)", () => {
    const schema = {
      fields: [{ db_fieldName: "title", type: "string" }],
    };
    const data = { title: "Hello World" };
    const result = stripNullRows(data, schema);
    expect(result.title).toBe("Hello World");
  });

  it("should ignore non-array fields (number)", () => {
    const schema = {
      fields: [{ db_fieldName: "count", type: "number" }],
    };
    const data = { count: 42 };
    const result = stripNullRows(data, schema);
    expect(result.count).toBe(42);
  });

  it("should NOT strip arrays on fields not marked as array type", () => {
    // Array value but field type is "string" — no stripping
    const schema = {
      fields: [{ db_fieldName: "data", type: "string" }],
    };
    const data = { data: [1, null, 3] };
    const result = stripNullRows(data, schema);
    expect(result.data).toEqual([1, null, 3]);
  });

  it("should strip nulls based on widget name ('blocks') even without explicit type", () => {
    const schema = {
      fields: [{ db_fieldName: "content", widget: { Name: "blocks" } }],
    };
    const data = { content: [{ id: 1 }, null, { id: 2 }] };
    const result = stripNullRows(data, schema);
    expect(result.content).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("should strip nulls based on widget name ('group')", () => {
    const schema = {
      fields: [{ db_fieldName: "groupData", widget: { Name: "group" } }],
    };
    const data = { groupData: [null, { val: 1 }] };
    const result = stripNullRows(data, schema);
    expect(result.groupData).toEqual([{ val: 1 }]);
  });

  it("should strip nulls based on widget name ('repeater')", () => {
    const schema = {
      fields: [{ db_fieldName: "rows", widget: { Name: "repeater" } }],
    };
    const data = { rows: [{ a: 1 }, null, undefined, { b: 2 }] };
    const result = stripNullRows(data, schema);
    expect(result.rows).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("should return empty array for field where all entries are null", () => {
    const schema = {
      fields: [{ db_fieldName: "items", type: "array" }],
    };
    const data = { items: [null, null, null] };
    const result = stripNullRows(data, schema);
    expect(result.items).toEqual([]);
  });

  it("should preserve an already empty array", () => {
    const schema = {
      fields: [{ db_fieldName: "items", type: "array" }],
    };
    const data = { items: [] };
    const result = stripNullRows(data, schema);
    expect(result.items).toEqual([]);
  });

  it("should return data unchanged when schema has no fields", () => {
    const data = { items: [1, null, 2] };
    const result = stripNullRows(data, {});
    expect(result).toEqual(data);
    // When schema has no fields, the original reference is returned (optimization)
    expect(result).toBe(data);
  });

  it("should not mutate the original data object", () => {
    const schema = {
      fields: [{ db_fieldName: "items", type: "array" }],
    };
    const data = { items: [1, null, 2] };
    const result = stripNullRows(data, schema);
    expect(result.items).toEqual([1, 2]);
    // Original remains unchanged
    expect(data.items).toEqual([1, null, 2]);
  });

  it("should handle multiple array fields independently", () => {
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
    const result = stripNullRows(data, schema);
    expect(result.tags).toEqual(["a", "b"]);
    expect(result.blocks).toEqual([{ x: 1 }]);
  });
});
