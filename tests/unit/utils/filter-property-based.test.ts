/**
 * @file tests/unit/utils/filter-property-based.test.ts
 * @description Property-based tests for the collection query/filter core using fast-check.
 *
 * The query core is the boundary between untrusted URL parameters and the
 * database: filter whitelisting, sort parsing and pagination must never widen
 * beyond the schema allow-list, never emit prototype-pollution keys, and never
 * throw on arbitrary input.
 *
 * ### Features:
 * - whitelistFilterParams: allow-list only, operator shapes only, prototype-safe, idempotent
 * - isFilterablePath: rejects malformed/prototype keys; accepts allowed ids and declared nested paths
 * - parseSortDescriptors: never throws, never widens fields, always asc/desc, bounded, deterministic
 * - parseCollectionListQuery: integer pagination (floor + clamp), whitelisted filters,
 *   sort fallback, filterLogic grammar
 * - stableSerialize: insertion-order independent and JSON round-trip safe
 * - rejectedFilterKeys: exact complement of filterable keys (accepted ∪ rejected = raw keys)
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Schema } from "@src/content/types";
import type { BooleanFilterGroup } from "@utils/boolean-filter";
import { stableSerialize } from "@utils/collection-query-filter-meta";
import {
  getAllowedFilterFieldIds,
  getNestedFilterPaths,
  isFilterablePath,
  parseCollectionListQuery,
  parseSortDescriptors,
  rejectedFilterKeys,
  whitelistFilterParams,
} from "@utils/collection-query-filters.server";

// ---------------------------------------------------------------------------
// Fixture — mirrors the shape used by collection-query-filters.test.ts
// ---------------------------------------------------------------------------

const fixtureCollection = {
  _id: "col_property_fixture",
  name: "Property Fixture",
  fields: [
    { label: "Title", db_fieldName: "title" },
    { label: "Status", db_fieldName: "status" },
    {
      label: "SEO",
      db_fieldName: "seo",
      type: "object",
      fields: [
        { label: "Description", db_fieldName: "description" },
        { label: "Keywords", db_fieldName: "keywords" },
      ],
    },
    {
      label: "Blocks",
      db_fieldName: "blocks",
      type: "repeater",
      fields: [
        { label: "Heading", db_fieldName: "heading" },
        {
          label: "Meta",
          db_fieldName: "meta",
          type: "object",
          fields: [{ label: "Alt", db_fieldName: "alt" }],
        },
      ],
    },
  ],
} as unknown as Schema;

const allowed = getAllowedFilterFieldIds(fixtureCollection);
const nested = getNestedFilterPaths(fixtureCollection);

const PROTOTYPE_KEYS = ["__proto__", "constructor", "prototype"] as const;
const LOGICAL_OPERATOR_KEYS = ["$and", "$or", "$nor", "$not"] as const;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Operator shapes `whitelistFilterParams` is documented to emit. */
const OPERATOR_SIGNATURES = new Set(["contains", "eq", "in", "isNull", "gte,lte"]);

function assertFilterOperatorShape(value: unknown): void {
  expect(value).toBeTypeOf("object");
  expect(value).not.toBeNull();
  const op = value as Record<string, unknown>;
  expect(OPERATOR_SIGNATURES.has(Object.keys(op).sort().join(","))).toBe(true);

  if ("contains" in op) {
    expect(typeof op.contains).toBe("string");
  } else if ("eq" in op) {
    expect(op.eq).not.toBeUndefined();
    expect(op.eq).not.toBeNull();
    expect(String(op.eq).trim()).not.toBe("");
  } else if ("in" in op) {
    expect(Array.isArray(op.in)).toBe(true);
    expect((op.in as unknown[]).length).toBeGreaterThan(0);
    expect((op.in as unknown[]).length).toBeLessThan(100);
  } else if ("isNull" in op) {
    expect(typeof op.isNull).toBe("boolean");
  } else {
    // gte/lte pair — at least one bound must be a real value.
    // trivial-assert-ok: the contract is a union (one or both bounds may be present).
    expect(op.gte !== undefined || op.lte !== undefined).toBe(true);
  }
}

const BOOLEAN_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "gt",
  "gte",
  "lt",
  "lte",
  "is_empty",
  "is_not_empty",
] as const;
const BOOLEAN_OPERATOR_SET = new Set<string>(BOOLEAN_OPERATORS);
const BOOLEAN_FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertBooleanGrammar(group: BooleanFilterGroup): void {
  expect(["AND", "OR"]).toContain(group.combinator);
  expect(Array.isArray(group.rules)).toBe(true);
  expect(group.rules.length).toBeGreaterThan(0);
  expect(group.rules.length).toBeLessThanOrEqual(12);

  for (const rule of group.rules) {
    expect(typeof rule.field).toBe("string");
    expect(rule.field.length).toBeLessThanOrEqual(80);
    expect(BOOLEAN_FIELD_RE.test(rule.field)).toBe(true);
    expect(BOOLEAN_OPERATOR_SET.has(rule.operator)).toBe(true);
    expect(typeof rule.value).toBe("string");
    expect((rule.value ?? "").length).toBeLessThanOrEqual(500);
  }
}

/**
 * Mirrors `withoutArrayIndices` in the source: index segments are removed from
 * the child path before the nested-index lookup.
 */
function expectedNestedAcceptance(parent: string, child: string): boolean {
  const children = nested.get(parent);
  if (!children) return false;
  const normalized = child
    .split(".")
    .filter((segment) => !/^\d+$/.test(segment))
    .join(".");
  return children.has(normalized);
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const FILTER_KEY_POOL = [
  "title",
  "status",
  "seo",
  "blocks",
  "_id",
  "createdAt",
  "updatedAt",
  "seo.description",
  "seo.keywords",
  "blocks.heading",
  "blocks.meta.alt",
  "blocks.0.heading",
  "evil",
  "seo.missing",
  "title.nope",
  "",
  ".title",
  "title.",
  "seo..description",
  "toString",
  "filter_title",
  ...LOGICAL_OPERATOR_KEYS,
  ...PROTOTYPE_KEYS,
] as const;

const filterKeyArb = fc.oneof(fc.constantFrom(...FILTER_KEY_POOL), fc.string({ maxLength: 12 }));

const filterOpValueArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.string({ maxLength: 12 }),
  fc.integer({ min: -100, max: 100 }),
  fc.boolean(),
  fc.array(fc.oneof(fc.string({ maxLength: 6 }), fc.integer({ min: -5, max: 5 })), {
    maxLength: 4,
  }),
  fc.record({
    contains: fc.option(fc.string({ maxLength: 8 }), { nil: undefined }),
    eq: fc.option(
      fc.oneof(fc.string({ maxLength: 8 }), fc.integer({ min: -5, max: 5 }), fc.boolean()),
      { nil: undefined },
    ),
    in: fc.option(
      fc.array(fc.oneof(fc.string({ maxLength: 5 }), fc.integer({ min: -5, max: 5 })), {
        maxLength: 4,
      }),
      { nil: undefined },
    ),
    isNull: fc.option(fc.boolean(), { nil: undefined }),
    gte: fc.option(fc.oneof(fc.string({ maxLength: 8 }), fc.integer({ min: -5, max: 5 })), {
      nil: undefined,
    }),
    lte: fc.option(fc.oneof(fc.string({ maxLength: 8 }), fc.integer({ min: -5, max: 5 })), {
      nil: undefined,
    }),
  }),
);

const rawFilterMapArb = fc.dictionary(filterKeyArb, filterOpValueArb, { maxKeys: 6 });

// ---------------------------------------------------------------------------
// whitelistFilterParams properties
// ---------------------------------------------------------------------------

describe("whitelistFilterParams — property-based", () => {
  it("only emits filterable keys with supported operator shapes and is idempotent", () => {
    fc.assert(
      fc.property(rawFilterMapArb, (raw) => {
        const once = whitelistFilterParams(raw, allowed, nested);
        const twice = whitelistFilterParams(once, allowed, nested);

        expect(twice).toEqual(once);

        for (const protoKey of PROTOTYPE_KEYS) {
          expect(Object.hasOwn(once, protoKey)).toBe(false);
        }

        for (const [key, op] of Object.entries(once)) {
          expect(Object.hasOwn(raw, key)).toBe(true);
          expect(isFilterablePath(key, allowed, nested)).toBe(true);
          assertFilterOperatorShape(op);
        }
      }),
      { numRuns: 250 },
    );
  });

  it("never forwards prototype-pollution keys sent as own JSON properties", () => {
    const raw = Object.fromEntries([
      ["__proto__", { contains: "polluted" }],
      ["constructor", { eq: "polluted" }],
      ["prototype", { in: ["polluted"] }],
      ["title", "kept"],
    ]);

    const filtered = whitelistFilterParams(raw, allowed, nested);

    expect(Object.keys(filtered)).toEqual(["title"]);
    for (const protoKey of PROTOTYPE_KEYS) {
      expect(Object.hasOwn(filtered, protoKey)).toBe(false);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isFilterablePath properties
// ---------------------------------------------------------------------------

const MALFORMED_FILTER_PATHS = [
  "",
  ".",
  "..",
  ".title",
  "title.",
  "seo.",
  ".seo.description",
  "seo..description",
  "seo.description.",
  "..seo.description",
  "__proto__",
  "__proto__.description",
  "__proto__.title",
  "constructor",
  "constructor.prototype",
  "prototype",
  "prototype.title",
  "toString",
  "toString.title",
  "hasOwnProperty",
] as const;

const NESTED_PARENT_POOL = [...nested.keys(), "title", "status", "evil", "", ...PROTOTYPE_KEYS];

const NESTED_CHILD_POOL = [
  ...new Set([...nested.values()].flatMap((children) => [...children])),
  "",
  "missing",
  "description.",
  ".description",
  "meta..alt",
  "0",
  "00",
  "0.heading",
  "toString",
  ...PROTOTYPE_KEYS,
];

const nestedParentArb = fc.constantFrom(...NESTED_PARENT_POOL);
const nestedChildArb = fc.oneof(
  fc.constantFrom(...NESTED_CHILD_POOL),
  fc.string({ maxLength: 10 }),
);

describe("isFilterablePath — property-based", () => {
  it("accepts every schema-allowed field id", () => {
    fc.assert(
      fc.property(fc.constantFrom(...allowed), (field) => {
        expect(isFilterablePath(field, allowed, nested)).toBe(true);
      }),
      { numRuns: 150 },
    );
  });

  it("rejects malformed and prototype-pollution keys", () => {
    for (const key of MALFORMED_FILTER_PATHS) {
      expect(isFilterablePath(key, allowed, nested)).toBe(false);
    }
  });

  it("accepts a nested path only when its parent and child exist in the index", () => {
    fc.assert(
      fc.property(nestedParentArb, nestedChildArb, (parent, child) => {
        const key = `${parent}.${child}`;
        expect(isFilterablePath(key, allowed, nested)).toBe(
          expectedNestedAcceptance(parent, child),
        );
      }),
      { numRuns: 250 },
    );
  });

  it("accepts every declared nested path under its root", () => {
    for (const [parent, children] of nested) {
      for (const child of children) {
        expect(isFilterablePath(`${parent}.${child}`, allowed, nested)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// parseSortDescriptors properties
// ---------------------------------------------------------------------------

const SORT_FIELD_POOL = [
  "title",
  "status",
  "createdAt",
  "updatedAt",
  "_id",
  "seo",
  "blocks",
  "_createdAt",
  "_updatedAt",
  "created_at",
  "updated_at",
  "nope",
  "",
  "-title",
  "-status",
  "Title",
  ...PROTOTYPE_KEYS,
  ...LOGICAL_OPERATOR_KEYS,
] as const;

const sortTokenArb = fc.oneof(
  fc.constantFrom(...SORT_FIELD_POOL),
  fc
    .tuple(
      fc.constantFrom(...SORT_FIELD_POOL),
      fc.constantFrom("asc", "desc", "ASC", "", "nonsense"),
    )
    .map(([field, direction]) => `${field}:${direction}`),
);

const rawSortArb = fc.oneof(
  fc.string({ maxLength: 30 }),
  fc.array(sortTokenArb, { maxLength: 4 }).map((tokens) => tokens.join(",")),
);

const rawOrderArb = fc.oneof(fc.constant(null), fc.string({ maxLength: 10 }));
const sortDefaultsArb = fc.record({
  sortField: fc.constantFrom("title", "status", "createdAt", "nope", ""),
  sortDirection: fc.constantFrom("asc", "desc"),
});

describe("parseSortDescriptors — property-based", () => {
  it("never throws, never widens the sort grammar, and is deterministic", () => {
    fc.assert(
      fc.property(rawSortArb, rawOrderArb, sortDefaultsArb, (rawSort, rawOrder, defaults) => {
        const descriptors = parseSortDescriptors(rawSort, rawOrder, allowed, defaults);
        const fallbackField = defaults.sortField || "createdAt";

        expect(descriptors.length).toBeGreaterThan(0);
        expect(descriptors.length).toBeLessThanOrEqual(rawSort.split(",").length);

        for (const descriptor of descriptors) {
          // trivial-assert-ok: a sort field is allowed by the schema OR the documented fallback.
          expect(allowed.has(descriptor.field) || descriptor.field === fallbackField).toBe(true);
          expect(["asc", "desc"]).toContain(descriptor.direction);
        }

        const again = parseSortDescriptors(rawSort, rawOrder, allowed, defaults);
        expect(again).toEqual(descriptors);
      }),
      { numRuns: 250 },
    );
  });
});

// ---------------------------------------------------------------------------
// parseCollectionListQuery properties
// ---------------------------------------------------------------------------

const QUERY_KEY_POOL = [
  "page",
  "pageSize",
  "search",
  "sort",
  "sortField",
  "order",
  "sortDirection",
  "filterLogic",
  "filter_title",
  "filter_status",
  "filter_createdAt",
  "filter_updatedAt",
  "filter__id",
  "filter_seo",
  "filter_seo.description",
  "filter_seo.missing",
  "filter_blocks.heading",
  "filter_blocks.meta.alt",
  "filter_evil",
  "filter___proto__",
  "filter_constructor",
  "filter_",
  "filter",
  "other",
] as const;

const QUERY_VALUE_POOL = [
  "",
  " ",
  "0",
  "1",
  "2",
  "-1",
  "2.5",
  "10.5",
  "500",
  "501",
  "999999",
  "abc",
  "NaN",
  "Infinity",
  "-Infinity",
  "1e3",
  "1e-3",
  "asc",
  "desc",
  "ASC",
  "title",
  "title:desc",
  "title:asc,createdAt:desc",
  "createdAt",
  "_createdAt",
  "seo.description",
  "__proto__",
  "constructor",
  "$and",
] as const;

const queryValueArb = fc.oneof(fc.string({ maxLength: 30 }), fc.constantFrom(...QUERY_VALUE_POOL));

const queryParamsArb = fc
  .array(fc.tuple(fc.constantFrom(...QUERY_KEY_POOL), queryValueArb), { maxLength: 8 })
  .map((pairs) => new URLSearchParams(pairs));

const listDefaultsArb = fc.record({
  sortField: fc.constantFrom("title", "status", "createdAt", "nope", ""),
  sortDirection: fc.constantFrom("asc", "desc"),
});

const booleanRuleArb = fc.record({
  field: fc.constantFrom(
    "title",
    "status",
    "createdAt",
    "seo",
    "blocks",
    "_id",
    "evil",
    "foo_bar",
    "__proto__",
    "constructor",
    "prototype",
  ),
  operator: fc.constantFrom(...BOOLEAN_OPERATORS),
  value: fc.string({ maxLength: 12 }),
});

const booleanGroupArb = fc.record({
  combinator: fc.constantFrom("AND", "OR"),
  rules: fc.array(booleanRuleArb, { minLength: 1, maxLength: 3 }),
});

const filterLogicPayloadArb = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc.jsonValue({ maxDepth: 2 }).map((value) => JSON.stringify(value)),
  booleanGroupArb.map((group) => JSON.stringify(group)),
);

describe("parseCollectionListQuery — property-based", () => {
  it("keeps pagination, sort and filters inside the documented schema contract", () => {
    fc.assert(
      fc.property(queryParamsArb, listDefaultsArb, (params, defaults) => {
        const parsed = parseCollectionListQuery(params, fixtureCollection, defaults);
        const fallbackField = defaults.sortField || "createdAt";

        expect(parsed.page).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(parsed.page)).toBe(true);
        expect(Number.isInteger(parsed.pageSize)).toBe(true);
        expect(parsed.pageSize).toBeGreaterThanOrEqual(1);
        expect(parsed.pageSize).toBeLessThanOrEqual(500);

        // trivial-assert-ok: a sort field is allowed by the schema OR the documented fallback.
        expect(allowed.has(parsed.sort.field) || parsed.sort.field === fallbackField).toBe(true);
        expect(["asc", "desc"]).toContain(parsed.sort.direction);

        for (const key of Object.keys(parsed.filter)) {
          expect(isFilterablePath(key, allowed, nested)).toBe(true);
        }
        for (const group of parsed.orGroups) {
          for (const key of Object.keys(group)) {
            expect(isFilterablePath(key, allowed, nested)).toBe(true);
          }
        }

        if (parsed.filterLogic) assertBooleanGrammar(parsed.filterLogic);
      }),
      { numRuns: 250 },
    );
  });

  it("only decodes filterLogic that stays inside the boolean grammar", () => {
    fc.assert(
      fc.property(filterLogicPayloadArb, (payload) => {
        const parsed = parseCollectionListQuery(
          new URLSearchParams({ filterLogic: payload }),
          fixtureCollection,
        );

        if (parsed.filterLogic) assertBooleanGrammar(parsed.filterLogic);
        for (const key of Object.keys(parsed.filter)) {
          expect(isFilterablePath(key, allowed, nested)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("preserves well-formed filterLogic groups and whitelists their compiled fields", () => {
    fc.assert(
      fc.property(booleanGroupArb, (group) => {
        const parsed = parseCollectionListQuery(
          new URLSearchParams({ filterLogic: JSON.stringify(group) }),
          fixtureCollection,
        );

        expect(parsed.filterLogic).toEqual(group);
        for (const key of Object.keys(parsed.filter)) {
          expect(isFilterablePath(key, allowed, nested)).toBe(true);
        }
      }),
      { numRuns: 150 },
    );
  });
});

// ---------------------------------------------------------------------------
// stableSerialize properties
// ---------------------------------------------------------------------------

describe("stableSerialize — property-based", () => {
  it("serializes identical key/value pairs identically regardless of insertion order", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ maxLength: 6 }), fc.jsonValue({ maxDepth: 2 }), {
          maxKeys: 4,
        }),
        (record) => {
          const entries = Object.entries(record);
          const forward = Object.fromEntries(entries);
          const reversed = Object.fromEntries([...entries].reverse());

          expect(stableSerialize(forward)).toBe(stableSerialize(reversed));
        },
      ),
      { numRuns: 200 },
    );
  });

  it("round-trips every JSON-safe value and never throws", () => {
    fc.assert(
      fc.property(fc.jsonValue({ maxDepth: 3 }), (value) => {
        const serialized = stableSerialize(value);
        const roundTripped = JSON.parse(serialized);

        expect(roundTripped).toEqual(JSON.parse(JSON.stringify(value)));
      }),
      { numRuns: 250 },
    );
  });
});

// ---------------------------------------------------------------------------
// rejectedFilterKeys properties
// ---------------------------------------------------------------------------

describe("rejectedFilterKeys — property-based", () => {
  it("is exactly the complement of the filterable raw keys", () => {
    fc.assert(
      fc.property(rawFilterMapArb, (raw) => {
        const rejected = rejectedFilterKeys(raw, allowed, nested);
        const rawKeys = Object.keys(raw);
        const expectedRejected = rawKeys.filter((key) => !isFilterablePath(key, allowed, nested));
        const accepted = rawKeys.filter((key) => isFilterablePath(key, allowed, nested));

        expect(rejected).toEqual(expectedRejected);
        expect(new Set(rejected).size).toBe(rejected.length);
        expect([...accepted, ...rejected].sort()).toEqual([...rawKeys].sort());
      }),
      { numRuns: 250 },
    );
  });

  it("returns no rejections for nullish input", () => {
    expect(rejectedFilterKeys(null, allowed, nested)).toEqual([]);
    expect(rejectedFilterKeys(undefined, allowed, nested)).toEqual([]);
  });
});
