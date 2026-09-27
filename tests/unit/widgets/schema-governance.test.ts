/**
 * @file tests/unit/widgets/schema-governance.test.ts
 * @description Enterprise Schema Governance Audit.
 * Performs static analysis and validation on the widget schema definitions
 * to prevent invalid configurations, reserved keywords, or structural impossibilities.
 */

import { describe, expect, it, vi } from "vitest";
vi.mock("@src/paraglide/messages", async () => (await import("./test-utils")).WIDGET_MESSAGES);
import InputWidget from "@widgets/core/input";
import NumberWidget from "@widgets/core/number";
import SelectWidget from "@widgets/core/select";
import RelationWidget from "@widgets/core/relation";
import { safeParse } from "valibot";

describe("Schema Governance & Linter Audit", () => {
  const coreWidgets = [
    InputWidget({ label: "Test Input" }),
    NumberWidget({ label: "Test Number" }),
    SelectWidget({
      label: "Test Select",
      options: [{ label: "A", value: "a" }],
    }),
    RelationWidget({ label: "Test Relation", relation: "auth_users" }),
  ];

  it("should enforce that no widget uses reserved SQL/MongoDB keywords for database fields", () => {
    const reservedKeywords = [
      "select",
      "insert",
      "update",
      "delete",
      "where",
      "drop",
      "table",
      "database",
      "$set",
      "$inc",
    ];

    for (const field of coreWidgets) {
      const dbField = field.db_fieldName;
      if (dbField) {
        expect(reservedKeywords.includes(dbField.toLowerCase())).toBe(false);
      }
    }
  });

  it("should verify that all core widgets expose a valid validationSchema", () => {
    for (const field of coreWidgets) {
      expect(field.widget.validationSchema).toBeDefined();
      expect(typeof field.widget.validationSchema).toBe("function");
    }
  });

  it("fails closed on mathematically impossible configurations instead of throwing", () => {
    const numField = NumberWidget({ label: "Number", min: 100, max: 10 }); // inverted range
    const schema = (numField.widget.validationSchema as any)(numField);

    // An inverted range can never be satisfied, so every value must be rejected and
    // parsing must not throw. (The previous assertion — `result` is defined — held for
    // every possible input, including a schema that accepted everything.)
    for (const value of [50, 0, 100, 10, 1000]) {
      expect(() => safeParse(schema, value)).not.toThrow();
      expect(safeParse(schema, value).success, `min>max must reject ${value}`).toBe(false);
    }

    // Control: a coherent range still accepts in-range values, proving the loop above
    // is specific to the inverted configuration rather than "numbers never validate".
    const saneField = NumberWidget({ label: "Number", min: 1, max: 10 });
    const saneSchema = (saneField.widget.validationSchema as any)(saneField);
    expect(safeParse(saneSchema, 5).success).toBe(true);
  });

  it("should verify schema structural integrity (no missing required meta-fields)", () => {
    for (const field of coreWidgets) {
      expect(field.widget.Name).toBeDefined();
      expect(field.widget.Icon).toBeDefined();
      expect(field.label).toBeDefined();
    }
  });
});
