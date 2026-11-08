/**
 * @file tests/unit/utils/diff-utils.test.ts
 * @description Unit tests for diff-utils and deep equality checking.
 */
import { describe, it, expect } from "vitest";
import { computeFieldDiff } from "@src/utils/diff-utils";

describe("diff-utils", () => {
  it("detects identical objects as unchanged", () => {
    const a = { title: "Test", count: 10, nested: { x: 1 } };
    const b = { title: "Test", count: 10, nested: { x: 1 } };
    const diff = computeFieldDiff(a, b);
    expect(diff.every((d) => d.type === "unchanged")).toBe(true);
  });

  it("detects modified nested values", () => {
    const a = { title: "Test", nested: { x: 1 } };
    const b = { title: "Test", nested: { x: 2 } };
    const diff = computeFieldDiff(a, b);
    const nestedDiff = diff.find((d) => d.fieldName === "nested");
    expect(nestedDiff?.type).toBe("modified");
  });

  it("detects key count differences", () => {
    const a = { title: "Test", nested: { x: 1 } };
    const b = { title: "Test", nested: { x: 1, y: 2 } };
    const diff = computeFieldDiff(a, b);
    const nestedDiff = diff.find((d) => d.fieldName === "nested");
    expect(nestedDiff?.type).toBe("modified");
  });

  it("detects added and removed fields", () => {
    const a = { title: "Test", oldField: "gone" };
    const b = { title: "Test", newField: "present" };
    const diff = computeFieldDiff(a, b);
    expect(diff.find((d) => d.fieldName === "oldField")?.type).toBe("removed");
    expect(diff.find((d) => d.fieldName === "newField")?.type).toBe("added");
  });
});
