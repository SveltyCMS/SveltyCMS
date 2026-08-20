/**
 * @file tests/unit/services/ai-builder/diff.test.ts
 * @description Unit tests for the schema diff engine.
 *
 * ### Features covered:
 * - all-added for empty/unknown schemas
 * - added / removed / changed classification
 * - db_fieldName / name / string-only / array-shaped schema tolerance
 * - widget string vs { Name } object equivalence
 * - reserved system fields never reported as removed
 */

import { describe, expect, it } from "vitest";
import { diffSchema } from "@src/services/ai-builder/diff";
import type { CollectionDesignProposal } from "@src/services/ai-builder/types";

const proposal: CollectionDesignProposal = {
  name: "Blog Post",
  slug: "blog-post",
  label: "Blog Post",
  fields: [
    { name: "title", label: "Title", widget: "Input", required: true },
    { name: "body", widget: "RichText" },
  ],
};

describe("diffSchema", () => {
  it("treats an empty/unknown schema as all-added", () => {
    for (const existing of [undefined, null, {}, "garbage", 42]) {
      const diff = diffSchema(existing, proposal);
      expect(diff.added).toHaveLength(2);
      expect(diff.removed).toHaveLength(0);
      expect(diff.changed).toHaveLength(0);
    }
  });

  it("reports removed fields absent from the proposal", () => {
    const existing = { fields: [{ db_fieldName: "oldField", widget: "Number" }] };
    const diff = diffSchema(existing, proposal);
    expect(diff.removed).toEqual([{ name: "oldField" }]);
    expect(diff.added).toHaveLength(2);
    expect(diff.changed).toHaveLength(0);
  });

  it("detects changed fields and keeps the raw before value", () => {
    const before = { db_fieldName: "title", widget: "RichText", required: false };
    const existing = { fields: [before] };
    const diff = diffSchema(existing, proposal);
    expect(diff.changed).toEqual([{ name: "title", before, after: proposal.fields[0] }]);
    expect(diff.removed).toHaveLength(0);
    expect(diff.added.map((field) => field.name)).toEqual(["body"]);
  });

  it("leaves equivalent fields untouched", () => {
    const existing = {
      fields: [
        { name: "title", label: "Title", widget: "Input", required: true },
        { db_fieldName: "body", widget: { Name: "RichText" } },
      ],
    };
    const diff = diffSchema(existing, proposal);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });

  it("never reports reserved system fields as removed", () => {
    const existing = {
      fields: [
        { db_fieldName: "tenantId", widget: "Input" },
        { db_fieldName: "status", widget: "Input" },
      ],
    };
    const diff = diffSchema(existing, proposal);
    expect(diff.removed).toEqual([]);
  });

  it("supports string-only field lists and array-shaped schemas", () => {
    const existing = ["title", "legacy"];
    const diff = diffSchema(existing, proposal);
    expect(diff.added.map((field) => field.name)).toEqual(["body"]);
    expect(diff.removed).toEqual([{ name: "legacy" }]);
    expect(diff.changed).toEqual([{ name: "title", before: "title", after: proposal.fields[0] }]);
  });

  it("treats validation-object changes as field changes", () => {
    const existing = {
      fields: [{ name: "body", widget: "RichText", validation: { maxLength: 100 } }],
    };
    const diff = diffSchema(existing, proposal);
    expect(diff.changed.map((change) => change.name)).toEqual(["body"]);
  });
});
