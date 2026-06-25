/**
 * @file tests/unit/widgets/remaining-core.test.ts
 * @description Boundary chaos for Group, Relation, MediaUpload widgets.
 * Tests validation schemas in isolation — no DB/file dependencies.
 */
import { describe, it, expect } from "vitest";
import { safeParse } from "valibot";
import GroupWidget from "@widgets/core/group";
import RelationWidget from "@widgets/core/relation";
import MediaUploadWidget from "@widgets/core/media-upload";
import SelectWidget from "@widgets/core/select";

const getSchema = (field: any) => {
  const raw = field.widget.validationSchema;
  return typeof raw === "function" ? raw(field) : raw;
};

const CHAOS = [null, undefined, "", [], NaN, "x".repeat(5000)];

describe("Group widget", () => {
  it("has validationSchema", () => {
    const f = GroupWidget({ label: "G" });
    expect(f.widget.validationSchema).toBeDefined();
  });

  it("handles chaos inputs", () => {
    const f = GroupWidget({ label: "G" });
    const s = getSchema(f);
    for (const v of CHAOS) {
      expect(() => safeParse(s, v)).not.toThrow();
    }
  });
});

describe("Relation widget", () => {
  it("has validationSchema", () => {
    const f = RelationWidget({ label: "R", relation: "posts" });
    expect(f.widget.validationSchema).toBeDefined();
  });

  it("handles chaos inputs", () => {
    const f = RelationWidget({ label: "R", relation: "posts" });
    const s = getSchema(f);
    for (const v of CHAOS) {
      expect(() => safeParse(s, v)).not.toThrow();
    }
  });
});

describe("MediaUpload widget", () => {
  it("has validationSchema", () => {
    const f = MediaUploadWidget({ label: "M" });
    expect(f.widget.validationSchema).toBeDefined();
  });

  it("handles chaos inputs", () => {
    const f = MediaUploadWidget({ label: "M" });
    const s = getSchema(f);
    for (const v of CHAOS) {
      expect(() => safeParse(s, v)).not.toThrow();
    }
  });
});

describe("Select widget (fixed)", () => {
  it("has validationSchema", () => {
    const f = SelectWidget({
      label: "S",
      options: [{ label: "A", value: "a" }],
    });
    expect(f.widget.validationSchema).toBeDefined();
  });

  it("accepts valid option", () => {
    const f = SelectWidget({
      label: "S",
      options: [{ label: "A", value: "a" }],
    });
    const s = getSchema(f);
    const result = safeParse(s, "a");
    expect(result.success).toBe(true);
  });

  it("rejects invalid option", () => {
    const f = SelectWidget({
      label: "S",
      options: [{ label: "A", value: "a" }],
    });
    const s = getSchema(f);
    const result = safeParse(s, "invalid");
    expect(result.success).toBe(false);
  });
});
