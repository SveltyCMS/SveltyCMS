/**
 * @file tests/unit/widgets/relation-data-integrity.test.ts
 * @description Relation widget: single/multiple, min/max, chaos, data integrity.
 */
import { describe, it, expect } from "vitest";
import { safeParse } from "valibot";
import RelationWidget from "@widgets/core/relation";
import { getSchema, testChaos } from "./test-utils";

describe("Relation Widget — Single", () => {
  it("validates single ID", () => {
    const f = RelationWidget({
      label: "Author",
      relation: "users",
      required: true,
    });
    const s = getSchema(f);
    expect(safeParse(s, "user-123").success).toBe(true);
    expect(safeParse(s, "").success).toBe(false);
  });

  it("rejects null when required", () => {
    const f = RelationWidget({
      label: "Author",
      relation: "users",
      required: true,
    });
    const s = getSchema(f);
    expect(safeParse(s, null).success).toBe(false);
  });

  it("rejects non-string values", () => {
    const f = RelationWidget({
      label: "Author",
      relation: "users",
      required: true,
    });
    const s = getSchema(f);
    expect(safeParse(s, 123).success).toBe(false);
  });
});

describe("Relation Widget — Multiple", () => {
  it("validates array of IDs", () => {
    const f = RelationWidget({
      label: "Tags",
      relation: "tags",
      multiple: true,
    });
    const s = getSchema(f);
    expect(safeParse(s, ["t1", "t2"]).success).toBe(true);
    expect(safeParse(s, []).success).toBe(true);
  });

  it("enforces min relations", () => {
    const f = RelationWidget({
      label: "Tags",
      relation: "tags",
      multiple: true,
      min: 2,
    });
    const s = getSchema(f);
    expect(safeParse(s, ["t1", "t2"]).success).toBe(true);
    expect(safeParse(s, ["t1"]).success).toBe(false);
  });

  it("enforces max relations", () => {
    const f = RelationWidget({
      label: "Tags",
      relation: "tags",
      multiple: true,
      max: 3,
    });
    const s = getSchema(f);
    expect(safeParse(s, ["t1", "t2", "t3"]).success).toBe(true);
    expect(safeParse(s, ["t1", "t2", "t3", "t4"]).success).toBe(false);
  });

  it("rejects non-array when multiple is true", () => {
    const f = RelationWidget({
      label: "Tags",
      relation: "tags",
      multiple: true,
    });
    const s = getSchema(f);
    expect(safeParse(s, "not-an-array").success).toBe(false);
  });
});

testChaos("Relation — chaos", RelationWidget, { relation: "posts" });
