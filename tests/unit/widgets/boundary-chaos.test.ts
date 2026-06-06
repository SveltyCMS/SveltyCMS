/**
 * @file tests/unit/widgets/boundary-chaos.test.ts
 * @description Boundary chaos tests for core widget validation schemas.
 * Every widget tested with null, NaN, extreme values, unicode, and XSS payloads.
 */
import { describe, it, expect } from "vitest";
import { safeParse } from "valibot";
import InputWidget from "@widgets/core/input";
import NumberWidget from "@widgets/core/number";
import EmailWidget from "@widgets/core/email";
import CheckboxWidget from "@widgets/core/checkbox";
import RadioWidget from "@widgets/core/radio";
import SlugWidget from "@widgets/core/slug";

const getSchema = (field: any) => {
  const raw = field.widget.validationSchema;
  return typeof raw === "function" ? raw(field) : raw;
};

const WIDGETS = [
  { name: "Input", factory: InputWidget },
  { name: "Number", factory: NumberWidget },
  { name: "Email", factory: EmailWidget },
  { name: "Checkbox", factory: CheckboxWidget },
  { name: "Radio", factory: RadioWidget },
  { name: "Slug", factory: SlugWidget },
];

const CHAOS = [
  { label: "null", value: null },
  { label: "undefined", value: undefined },
  { label: "empty string", value: "" },
  { label: "empty array", value: [] },
  { label: "NaN", value: NaN },
  { label: "10K string", value: "x".repeat(10_000) },
  { label: "unicode", value: "こんにちは🌍" },
  { label: "XSS payload", value: "<script>alert(1)</script>" },
];

describe("Widget Boundary Chaos Tests", () => {
  for (const { name, factory } of WIDGETS) {
    describe(`${name}`, () => {
      it("has validationSchema", () => {
        const field = factory({ label: "Test" });
        expect(field.widget.validationSchema).toBeDefined();
      });

      it("rejects null when required", () => {
        const field = factory({ label: "Test", required: true });
        const s = getSchema(field);
        expect(safeParse(s, null).success).toBe(false);
      });

      it("handles all chaos inputs without throwing", () => {
        const field = factory({ label: "Test" });
        const s = getSchema(field);
        for (const { label, value } of CHAOS) {
          expect(() => safeParse(s, value), `${name} on ${label}`).not.toThrow();
        }
      });
    });
  }

  describe("Number — boundary", () => {
    it("rejects NaN", () => {
      const f = NumberWidget({ label: "N", required: true });
      expect(safeParse(getSchema(f), NaN).success).toBe(false);
    });
    it("handles MAX/MIN_SAFE_INTEGER", () => {
      const f = NumberWidget({ label: "N" });
      const s = getSchema(f);
      expect(() => safeParse(s, Number.MAX_SAFE_INTEGER)).not.toThrow();
      expect(() => safeParse(s, Number.MIN_SAFE_INTEGER)).not.toThrow();
    });
  });

  describe("Email — edge", () => {
    it("rejects invalid", () => {
      const f = EmailWidget({ label: "E", required: true });
      const s = getSchema(f);
      expect(safeParse(s, "not-email").success).toBe(false);
    });
    it("handles extreme inputs", () => {
      const f = EmailWidget({ label: "E" });
      const s = getSchema(f);
      expect(() => safeParse(s, null)).not.toThrow();
      expect(() => safeParse(s, "x".repeat(500))).not.toThrow();
    });
  });
});
