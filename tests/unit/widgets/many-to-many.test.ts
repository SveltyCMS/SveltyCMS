/**
 * @file tests/unit/widgets/many-to-many.test.ts
 * @description ManyToMany widget definition + validation contract.
 *
 * The junction widget must stay a many-to-many by construction (`multiple` is
 * always true), default to the built-in junction collection, and accept both
 * payload shapes the API/UI may send.
 */
import { describe, expect, it } from "vitest";
import { safeParse } from "valibot";
import ManyToManyWidget from "@src/widgets/core/many-to-many";

function makeField(overrides: Record<string, unknown> = {}) {
  return ManyToManyWidget({
    label: "Tags",
    db_fieldName: "tags",
    collection: "tags",
    displayField: "name",
    ...overrides,
  } as never);
}

function schemaFor(field: ReturnType<typeof makeField>) {
  const schema = field.widget.validationSchema;
  return typeof schema === "function" ? schema(field) : schema;
}

const parse = (field: ReturnType<typeof makeField>, value: unknown) =>
  safeParse(schemaFor(field) as never, value);

describe("ManyToMany widget", () => {
  it("is a ManyToMany, always multiple, defaulting to the built-in junction", () => {
    const field = makeField();
    expect(field.widget.Name).toBe("ManyToMany");
    expect((field as unknown as { multiple?: boolean }).multiple).toBe(true);
    expect((field as unknown as { through?: string }).through).toBe("contentRelations");
  });

  it("accepts an id array", () => {
    expect(parse(makeField(), ["tag-1", "tag-2"]).success).toBe(true);
  });

  it("accepts edge objects with sort and metadata", () => {
    expect(
      parse(makeField(), [{ id: "tag-1", sort: 0, metadata: { label: "First" } }, { id: "tag-2" }])
        .success,
    ).toBe(true);
  });

  it("rejects an object without an id and a non-array payload", () => {
    expect(parse(makeField(), [{}]).success).toBe(false);
    expect(parse(makeField(), "tag-1").success).toBe(false);
  });

  it("enforces min/max", () => {
    const field = makeField({ min: 2, max: 3 });
    expect(parse(field, ["tag-1"]).success).toBe(false);
    expect(parse(field, ["tag-1", "tag-2"]).success).toBe(true);
    expect(parse(field, ["tag-1", "tag-2", "tag-3", "tag-4"]).success).toBe(false);
  });

  it("rejects an empty array when required", () => {
    const field = makeField({ required: true });
    expect(parse(field, []).success).toBe(false);
    expect(parse(field, ["tag-1"]).success).toBe(true);
  });

  it("allows null when not required", () => {
    expect(parse(makeField(), null).success).toBe(true);
  });
});
