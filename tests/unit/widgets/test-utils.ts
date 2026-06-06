/**
 * @file tests/unit/widgets/test-utils.ts
 * @description Shared widget test utilities: schema extraction, chaos inputs, property testing.
 */
import { expect, it } from "vitest";
import { safeParse } from "valibot";

/** Common chaos inputs for widget validation boundary testing */
export const CHAOS = [
  null,
  undefined,
  "",
  [],
  NaN,
  "x".repeat(10_000),
  "<script>alert(1)</script>",
  "こんにちは🌍",
];

/** Extract validation schema — handles both function and object schemas */
export function getSchema(field: any) {
  const raw = field.widget?.validationSchema;
  return typeof raw === "function" ? raw(field) : raw;
}

/** Run chaos inputs on a widget factory — adds test cases automatically */
export function testChaos(name: string, factory: any, fieldConfig: any = {}) {
  describe(name, () => {
    it("has validationSchema", () => {
      const f = factory({ label: "Test", ...fieldConfig });
      expect(f.widget.validationSchema).toBeDefined();
    });

    it("rejects null when required", () => {
      const f = factory({ label: "Test", required: true, ...fieldConfig });
      const s = getSchema(f);
      expect(safeParse(s, null).success).toBe(false);
    });

    it("handles chaos inputs", () => {
      const f = factory({ label: "Test", ...fieldConfig });
      const s = getSchema(f);
      for (const v of CHAOS) {
        expect(() => safeParse(s, v)).not.toThrow();
      }
    });
  });
}
