/**
 * @file tests/unit/widgets/test-utils.ts
 * @description Shared widget test utilities: schema extraction, chaos inputs, property
 * testing, and the paraglide message-catalog boundary mock.
 *
 * `WIDGET_MESSAGES` stands in for `@src/paraglide/messages` in widget suites. The real
 * barrel re-exports 1400+ generated message modules, which costs ~5s of Vite transform
 * per test file while contributing nothing to the behaviour under test (widget
 * validation schemas and factory contracts). Every widget `index.ts` calls exactly one
 * `widget_*_description()` for its `Description` field — no suite asserts on the
 * resulting text. The list below is exhaustive for the source tree: a widget that starts
 * calling a new message would get `undefined` and throw at import, so this mock cannot
 * silently hide a regression.
 */
import { describe, expect, it } from "vitest";
import { safeParse } from "valibot";

/** Common chaos inputs for widget validation boundary testing (labelled for failure messages) */
export const CHAOS_CASES = [
  { label: "null", value: null },
  { label: "undefined", value: undefined },
  { label: "empty string", value: "" },
  { label: "empty array", value: [] },
  { label: "NaN", value: NaN },
  { label: "10K string", value: "x".repeat(10_000) },
  { label: "unicode", value: "こんにちは🌍" },
  { label: "XSS payload", value: "<script>alert(1)</script>" },
];

/** Bare values from {@link CHAOS_CASES}. */
export const CHAOS = CHAOS_CASES.map((c) => c.value);

/**
 * Stand-in namespace for `@src/paraglide/messages`, covering every
 * `widget_*_description` export reachable from the widget graph.
 *
 * Usage (the factory must be async so `vi.mock` can stay hoisted):
 * `vi.mock("@src/paraglide/messages", async () => (await import("./test-utils")).WIDGET_MESSAGES);`
 */
export const WIDGET_MESSAGES = {
  widget_address_description: () => "Address",
  widget_checkbox_description: () => "Checkbox",
  widget_colorPicker_description: () => "Color Picker",
  widget_currency_description: () => "Currency",
  widget_date_description: () => "Date",
  widget_dateRange_description: () => "Date Range",
  widget_email_description: () => "Email",
  widget_media_description: () => "Media",
  widget_megaMenu_description: () => "Mega Menu",
  widget_number_description: () => "Number",
  widget_phoneNumber_description: () => "Phone Number",
  widget_radio_description: () => "Radio",
  widget_rating_description: () => "Rating",
  widget_relation_description: () => "Relation",
  widget_remoteVideo_description: () => "Remote Video",
  widget_richText_description: () => "Rich Text",
  widget_seo_description: () => "SEO",
  widget_text_description: () => "Text",
} as const;

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
