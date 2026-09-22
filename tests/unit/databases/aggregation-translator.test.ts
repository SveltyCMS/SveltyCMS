/**
 * @file tests/unit/databases/aggregation-translator.test.ts
 * @description Unit guard for the MongoDB-pipeline → SQL translation that makes
 * `crud.aggregate()` engine-agnostic.
 *
 * Features:
 * - Plan shapes for the supported stages: `$match` (→ `where`), `$group`
 *   (→ `groupBy` + accumulators), `$sort`, `$skip`, `$limit`, `$count`, `$project`
 * - Accumulator mapping, including `$sum: 1` → `COUNT(*)` and the numeric safe
 *   extraction (`numericField`) for `SUM`/`AVG` versus the plain one for `MIN`/`MAX`
 * - Fail-closed coverage: every unsupported stage or shape must return a named
 *   `NOT_SUPPORTED`-style message instead of a silently wrong result
 * - Purity: the pipeline array is never mutated
 *
 * The translator is dialect-free by design (the adapter supplies `field`,
 * `numericField` and `match`), so a marker dialect lets each assertion read the
 * exact expression the SQL engine would receive without a database.
 */

import { describe, expect, it } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import {
  translateAggregation,
  type AggregationPlan,
  type AggregationDialect,
} from "@src/databases/core/aggregation-translator";

/** Marker dialect: `F[x]` physical/dynamic field, `N[x]` numeric, `M[a,b]` match. */
const dialect: AggregationDialect = {
  engine: "test",
  field: (name) => sql.raw(`F[${name}]`),
  numericField: (name) => sql.raw(`N[${name}]`),
  orderedField: (name) => sql.raw(`O[${name}]`),
  // An empty filter is what a mapper returns when nothing maps to a condition.
  match: (filter) => {
    const keys = Object.keys(filter);
    return keys.length === 0 ? undefined : sql.raw(`M[${keys.join(",")}]`);
  },
};

/** A dialect whose extraction is TEXT — it cannot order JSON values type-safely. */
const textDialect: AggregationDialect = {
  ...dialect,
  engine: "text-engine",
  orderedField: () => null,
};

interface RenderableQuery {
  toQuery(config: {
    escapeName: (name: string) => string;
    escapeParam: (param: unknown, index: number) => string;
  }): { sql: string; params: unknown[] };
}

/** Renders a plan expression the way the adapter's `toQuery` would. */
function render(query: SQL): string {
  return (query as unknown as RenderableQuery).toQuery({
    escapeName: (name) => `"${name}"`,
    escapeParam: (_param, index) => `$${index + 1}`,
  }).sql;
}

/** Plan of a pipeline that must succeed (fails the test otherwise). */
function planOf(
  pipeline: unknown[],
  d: AggregationDialect = dialect,
): Extract<AggregationPlan, { ok: true }> {
  const plan = translateAggregation(pipeline, d);
  if (!plan.ok) throw new Error(`expected a plan, got the refusal: ${plan.message}`);
  return plan;
}

/** Refusal message of a pipeline that must fail closed. */
function messageOf(pipeline: unknown[], d: AggregationDialect = dialect): string {
  const plan = translateAggregation(pipeline, d);
  if (plan.ok) throw new Error("expected the translator to refuse this pipeline");
  return plan.message;
}

/** Rendered select expressions as a plain `{ alias: sql }` map. */
function selectSql(plan: Extract<AggregationPlan, { ok: true }>): Record<string, string> {
  return Object.fromEntries(Object.entries(plan.select ?? {}).map(([k, v]) => [k, render(v)]));
}

describe("translateAggregation — documents (no group/project)", () => {
  it("returns the `findMany` shape for an empty pipeline", () => {
    const plan = planOf([]);
    expect(plan.select).toBeNull();
    expect(plan.where).toBeUndefined();
    expect(plan.groupBy).toBeUndefined();
    expect(plan.orderBy).toBeUndefined();
    expect(plan.limit).toBeUndefined();
    expect(plan.offset).toBeUndefined();
  });

  it("maps `$match` to a WHERE condition through the adapter's own mapper", () => {
    const plan = planOf([{ $match: { status: "published" } }]);
    expect(plan.where).toBeDefined();
    expect(render(plan.where as SQL)).toBe("M[status]");
    expect(plan.select).toBeNull();
  });

  it("ANDs several `$match` stages", () => {
    const plan = planOf([{ $match: { status: "published" } }, { $match: { views: 1 } }]);
    expect(render(plan.where as SQL)).toContain("M[status]");
    expect(render(plan.where as SQL)).toContain("M[views]");
  });
});

describe("translateAggregation — $group", () => {
  it("groups on a scalar `_id` and selects the key plus accumulators", () => {
    const plan = planOf([
      {
        $group: {
          _id: "$status",
          total: { $sum: 1 },
          views: { $sum: "$views" },
          avgViews: { $avg: "$views" },
          min: { $min: "$views" },
          max: { $max: "$views" },
        },
      },
    ]);
    expect(plan.groupBy?.map(render)).toEqual(["F[status]"]);
    expect(selectSql(plan)).toEqual({
      _id: "F[status]",
      total: "COUNT(*)",
      views: "SUM(N[views])",
      avgViews: "AVG(N[views])",
      // MIN/MAX use the ordering-safe expression, never the plain extraction.
      min: "MIN(O[views])",
      max: "MAX(O[views])",
    });
  });

  it("refuses `$min`/`$max` when the dialect cannot order the field type-safely", () => {
    // PostgreSQL/MariaDB extract JSON as TEXT and have no JSON-typed MIN/MAX, so a
    // lexicographic answer ("10" before "2") must never be returned as a number.
    const min = messageOf([{ $group: { _id: null, m: { $min: "$views" } } }], textDialect);
    expect(min).toContain('$min on the dynamic field "views" is not supported on text-engine');
    expect(min).toContain("materialize: true");

    const max = messageOf([{ $group: { _id: null, m: { $max: "$views" } } }], textDialect);
    expect(max).toContain("$max on the dynamic field");
  });

  it("treats `_id: null` as a single group (no GROUP BY)", () => {
    const plan = planOf([{ $group: { _id: null, total: { $sum: 1 } } }]);
    expect(plan.groupBy).toBeUndefined();
    expect(selectSql(plan)).toEqual({ total: "COUNT(*)" });
  });

  it("supports dotted group keys (`$meta.lang`) like the filter mapper", () => {
    const plan = planOf([{ $group: { _id: "$meta.lang", total: { $count: {} } } }]);
    expect(plan.groupBy?.map(render)).toEqual(["F[meta.lang]"]);
    expect(selectSql(plan).total).toBe("COUNT(*)");
  });

  it("rejects a `$sum` argument that is neither the `1` shorthand nor a field reference", () => {
    // `$sum: 2` is not a field reference and not the `1` count shorthand.
    expect(messageOf([{ $group: { _id: null, total: { $sum: 2 } } }])).toContain("$sum");
  });
});

describe("translateAggregation — $sort / $skip / $limit", () => {
  it("sorts on group aliases when they exist, else on fields", () => {
    const grouped = planOf([
      { $group: { _id: "$status", total: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);
    expect(grouped.orderBy?.map(render)).toEqual(["COUNT(*) DESC"]);

    const ungrouped = planOf([{ $match: { status: "published" } }, { $sort: { title: 1 } }]);
    expect(ungrouped.orderBy?.map(render)).toEqual(["F[title] ASC"]);
  });

  it("maps `$skip`/`$limit` onto OFFSET/LIMIT", () => {
    const plan = planOf([{ $skip: 20 }, { $limit: 10 }]);
    expect(plan.offset).toBe(20);
    expect(plan.limit).toBe(10);
  });

  it("rejects a bad direction, a negative skip and a non-positive limit", () => {
    expect(messageOf([{ $sort: { title: 2 } }])).toContain('direction for "title"');
    expect(messageOf([{ $skip: -1 }])).toContain("non-negative integer");
    expect(messageOf([{ $limit: 0 }])).toContain("positive integer");
  });
});

describe("translateAggregation — $count / $project", () => {
  it('maps `$count: "total"` to a COUNT(*) select', () => {
    const plan = planOf([{ $match: { status: "published" } }, { $count: "total" }]);
    expect(selectSql(plan)).toEqual({ total: "COUNT(*)" });
  });

  it("projects fields and keeps `_id` unless it is explicitly excluded", () => {
    const kept = planOf([{ $project: { title: 1 } }]);
    expect(selectSql(kept)).toEqual({ title: "F[title]" });

    const grouped = planOf([
      { $group: { _id: "$status", total: { $sum: 1 } } },
      { $project: { total: 1 } },
    ]);
    // The group's `_id` survives the projection, resolved from the group select.
    expect(selectSql(grouped)).toEqual({ total: "COUNT(*)", _id: "F[status]" });

    const dropped = planOf([{ $project: { title: 1, _id: 0 } }]);
    expect(selectSql(dropped)).toEqual({ title: "F[title]" });
  });

  it("rejects exclude-only and computed projections", () => {
    expect(messageOf([{ $project: { _id: 0 } }])).toContain("include at least one field");
    expect(messageOf([{ $project: { title: 0 } }])).toContain("include at least one field");
    expect(messageOf([{ $project: { title: 2 } }])).toContain("include-only");
  });
});

describe("translateAggregation — fail-closed refusals", () => {
  it("names unsupported stages instead of ignoring them", () => {
    for (const stage of ["$lookup", "$unwind", "$facet", "$addFields", "$replaceRoot"]) {
      const message = messageOf([{ [stage]: {} }]);
      expect(message).toContain(stage);
      expect(message).toContain("not supported on SQL engines");
    }
  });

  it("refuses stage shapes SQL cannot express", () => {
    expect(messageOf([{ $group: { _id: { a: "$a", b: "$b" }, total: { $sum: 1 } } }])).toContain(
      "scalar $group._id",
    );
    expect(messageOf([{ $group: { total: { $sum: 1 } } }])).toContain("requires an _id key");
    expect(messageOf([{ $group: { _id: null, tags: { $push: "$tag" } } }])).toContain(
      "Unsupported accumulator $push",
    );
    expect(messageOf([{ $group: { _id: null } }])).toContain("no accumulators");
  });

  it("refuses out-of-order stages rather than reordering them", () => {
    // Reordering would change the result, so `$match` after `$group` (a HAVING) and
    // `$group` after `$sort`/`$limit` must be rejected.
    expect(
      messageOf([{ $group: { _id: "$a", total: { $sum: 1 } } }, { $match: { total: 2 } }]),
    ).toContain("narrow the input with a $match before $group");
    expect(
      messageOf([{ $sort: { title: 1 } }, { $group: { _id: null, total: { $sum: 1 } } }]),
    ).toContain("$group must precede");
    expect(messageOf([{ $count: "total" }, { $group: { _id: null, n: { $sum: 1 } } }])).toContain(
      "$group must precede",
    );
    expect(
      messageOf([
        { $group: { _id: "$a", total: { $sum: 1 } } },
        { $group: { _id: "$b", total: { $sum: 1 } } },
      ]),
    ).toContain("Only one $group");
    expect(
      messageOf([{ $group: { _id: "$a", total: { $sum: 1 } } }, { $count: "total" }]),
    ).toContain("$count after $group");
  });

  it("refuses a `$match` that maps to no condition (would drop the restriction)", () => {
    expect(messageOf([{ $match: {} }])).toContain("produced no condition");
    expect(messageOf([{ $match: "published" }])).toContain("requires a filter object");
  });

  it("refuses malformed stages and a non-array pipeline", () => {
    expect(messageOf("not a pipeline" as unknown as unknown[])).toContain("must be an array");
    expect(messageOf([null])).toContain("Stage 0");
    expect(messageOf([{ $match: {}, $limit: 1 }])).toContain("exactly one operator key");
  });

  it("never mutates the caller's pipeline", () => {
    const pipeline = [{ $match: { status: "published" } }, { $limit: 5 }];
    const snapshot = JSON.parse(JSON.stringify(pipeline));
    planOf(pipeline);
    expect(pipeline).toEqual(snapshot);
  });
});
