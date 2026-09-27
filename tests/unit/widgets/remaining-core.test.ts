/**
 * @file tests/unit/widgets/remaining-core.test.ts
 * @description Schema contract for the core widgets that boundary-chaos.test.ts
 * does not cover (Group, Relation, MediaUpload, Select): each schema must accept
 * its valid shapes, reject null when the field is required, and never throw on
 * hostile input. Runs in isolation — no DB/file dependencies.
 */

import { describe, expect, it, vi } from "vitest";
import { safeParse } from "valibot";
import GroupWidget from "@widgets/core/group";
import MediaUploadWidget from "@widgets/core/media-upload";
import RelationWidget from "@widgets/core/relation";
import SelectWidget from "@widgets/core/select";
import { CHAOS_CASES, getSchema } from "./test-utils";

vi.mock("@src/paraglide/messages", async () => (await import("./test-utils")).WIDGET_MESSAGES);

interface WidgetCase {
  name: string;
  /** Fixture signature differs per widget, so the factory stays loose (cf. `testChaos`). */
  factory: (config: any) => any;
  config: Record<string, unknown>;
  /** Values the schema must accept. */
  valid: unknown[];
  /** Values the schema must reject. */
  invalid: unknown[];
}

const SELECT_OPTIONS = [
  { label: "A", value: "a" },
  { label: "B", value: "b" },
];

const CASES: WidgetCase[] = [
  {
    name: "Group",
    factory: GroupWidget,
    config: { label: "G" },
    valid: [{}, { any: "data" }],
    invalid: [null, "x", 5],
  },
  {
    name: "Relation",
    factory: RelationWidget,
    config: { label: "R", relation: "posts" },
    valid: ["posts-1"],
    invalid: [{ id: "x" }],
  },
  {
    name: "MediaUpload",
    factory: MediaUploadWidget,
    config: { label: "M" },
    valid: ["media-id"],
    invalid: ["", [], undefined],
  },
  {
    name: "Select",
    factory: SelectWidget,
    config: { label: "S", options: SELECT_OPTIONS },
    valid: ["a", "b"],
    invalid: ["invalid", ""],
  },
];

describe("remaining core widgets — schema contract", () => {
  it.each(CASES)(
    "$name exposes a schema that is callable or directly parseable",
    ({ factory, config }) => {
      const declared = factory(config).widget.validationSchema;

      expect(declared).toBeDefined();
      expect(["function", "object"]).toContain(typeof declared);
    },
  );

  it.each(CASES)(
    "$name accepts its valid shapes and rejects null when required",
    ({ factory, config, valid, invalid }) => {
      const requiredSchema = getSchema(factory({ ...config, required: true }));
      expect(safeParse(requiredSchema, null).success).toBe(false);

      const optionalSchema = getSchema(factory(config));
      for (const value of valid) {
        expect(safeParse(optionalSchema, value).success, `${value} should be accepted`).toBe(true);
      }
      for (const value of invalid) {
        expect(safeParse(optionalSchema, value).success, `${value} should be rejected`).toBe(false);
      }
    },
  );

  it.each(CASES)("$name never throws on chaos inputs", ({ factory, config }) => {
    const schema = getSchema(factory(config));
    for (const { label, value } of CHAOS_CASES) {
      expect(() => safeParse(schema, value), `chaos input "${label}"`).not.toThrow();
    }
  });
});
