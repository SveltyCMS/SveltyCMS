/**
 * @file src/databases/core/aggregation-translator.ts
 * @description
 * Translates the DB-agnostic (MongoDB-style) aggregation pipeline into a SQL plan
 * for the relational adapters, so `crud.aggregate()` is no longer MongoDB-only
 * (`NOT_SUPPORTED` on SQLite/PostgreSQL/MariaDB).
 *
 * ### Features:
 * - `$match` (any number, before `$group`) → `WHERE` through the adapter's own query
 *   mapper, so filters, JSON fields and the tenant scope behave exactly like
 *   `find*` (`getJsonEquals` containment included)
 * - `$group` with a scalar `_id` key (`null` or `"$field"`, dotted paths allowed)
 *   and the `$sum` / `$avg` / `$min` / `$max` / `$count` accumulators
 *   (`$sum: 1` → `COUNT(*)`)
 * - `$min`/`$max` go through `orderedField`: a materialized column, or a typed JSON
 *   extraction on engines that have one. Where the engine would have to compare
 *   extracted TEXT (PostgreSQL, MariaDB), the stage is **refused** with a
 *   materialization hint rather than returning a lexicographic answer.
 * - `$sort` / `$skip` / `$limit` after the group, plus a terminal `$count: "name"`
 * - terminal include-only `$project` (`{a: 1, _id: 0}`) over fields or group aliases
 * - **fail-closed**: any stage or shape the plan cannot express returns a named
 *   `NOT_SUPPORTED` message instead of a silently wrong result (`$lookup`,
 *   `$unwind`, `$facet`, compound `_id`, out-of-order stages, …)
 *
 * The module is pure: the adapter supplies the SQL expressions (`field`,
 * `numericField`, `match`, `base`), so the same plan is unit-testable without a
 * database.
 */

import { and, sql, type SQL } from "drizzle-orm";

/** Adapter-supplied SQL expression builders. */
export interface AggregationDialect {
  /** Engine label used in refusal messages (e.g. `"postgresql"`). */
  engine: string;
  /** Field → SQL expression: a physical column when materialized, else a JSON extraction. */
  field(name: string): SQL;
  /**
   * Same, but numeric-safe: engines whose JSON extraction renders text (PostgreSQL
   * `->>`, MariaDB `JSON_UNQUOTE`) need a cast before `SUM`/`AVG`.
   */
  numericField(name: string): SQL;
  /** `$match` object → `WHERE` condition (the adapter's normal query mapper). */
  match(filter: Record<string, unknown>): SQL | undefined;
  /**
   * Ordering-safe expression for `$min`/`$max`: a materialized column (native type,
   * native order) or a typed JSON extraction. `null` means the engine cannot order
   * this field's values type-safely — see `getJsonOrderedField` in the SQL adapters.
   */
  orderedField(name: string): SQL | null;
}

export type AggregationPlan =
  | {
      ok: true;
      /** `null` → the adapter's default projection (documents, like MongoDB). */
      select: Record<string, SQL> | null;
      where?: SQL;
      groupBy?: SQL[];
      orderBy?: SQL[];
      limit?: number;
      offset?: number;
    }
  | { ok: false; message: string };

/** Stages the translator implements. Anything else fails closed with its own name. */
const SUPPORTED_STAGES = ["$match", "$group", "$sort", "$skip", "$limit", "$count", "$project"];

const fail = (message: string): AggregationPlan => ({ ok: false, message });

/** `"$field"` → `field`; expressions (`$$ROOT`, `$literal`) are not supported. */
function fieldRef(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("$")) return null;
  const name = value.slice(1);
  return name.length > 0 && !name.startsWith("$") ? name : null;
}

/**
 * One `$group` accumulator → SQL, or a named refusal. `$min`/`$max` refuse when the
 * dialect cannot order the field safely (see `AggregationDialect.orderedField`).
 */
function groupAccumulator(
  op: string,
  arg: unknown,
  dialect: AggregationDialect,
): { ok: true; expr: SQL } | { ok: false; message: string } {
  const missingRef = (): { ok: false; message: string } => ({
    ok: false,
    message: `${op} requires a field reference like "$views"`,
  });

  switch (op) {
    case "$sum": {
      if (arg === 1) return { ok: true, expr: sql`COUNT(*)` };
      const ref = fieldRef(arg);
      if (!ref) return missingRef();
      return { ok: true, expr: sql`SUM(${dialect.numericField(ref)})` };
    }
    case "$avg": {
      const ref = fieldRef(arg);
      if (!ref) return missingRef();
      return { ok: true, expr: sql`AVG(${dialect.numericField(ref)})` };
    }
    case "$min":
    case "$max": {
      const ref = fieldRef(arg);
      if (!ref) return missingRef();
      const ordered = dialect.orderedField(ref);
      if (!ordered) {
        return {
          ok: false,
          message:
            `${op} on the dynamic field "${ref}" is not supported on ${dialect.engine}: ` +
            "without a materialized column the extracted JSON is TEXT, so the aggregate " +
            'would order lexicographically (MIN returns "10" before "2"). Materialize the ' +
            "field (declare it with `indexed` or `materialize: true`) to aggregate it natively.",
        };
      }
      return { ok: true, expr: op === "$min" ? sql`MIN(${ordered})` : sql`MAX(${ordered})` };
    }
    case "$count":
      return { ok: true, expr: sql`COUNT(*)` };
    default:
      return { ok: false, message: `Unsupported accumulator ${op}` };
  }
}

/**
 * Translate a pipeline into a SQL plan. Stages must appear in an order SQL can
 * express (matches → group → sort → skip → limit → count/project); anything else is
 * rejected rather than reordered, because reordering would change the result.
 */
export function translateAggregation(
  pipeline: unknown[],
  dialect: AggregationDialect,
): AggregationPlan {
  if (!Array.isArray(pipeline)) return fail("Aggregation pipeline must be an array of stages");

  const matches: SQL[] = [];
  const groupBy: SQL[] = [];
  const orderBy: SQL[] = [];
  let select: Record<string, SQL> | null = null;
  let hasGroup = false;
  let hasProject = false;
  let counted = false;
  let limit: number | undefined;
  let offset: number | undefined;

  for (let index = 0; index < pipeline.length; index++) {
    const stage = pipeline[index];
    if (!stage || typeof stage !== "object" || Array.isArray(stage)) {
      return fail(`Stage ${index} must be an object with exactly one operator key`);
    }
    const keys = Object.keys(stage);
    if (keys.length !== 1) {
      return fail(`Stage ${index} must have exactly one operator key, got: ${keys.join(", ")}`);
    }
    const op = keys[0];
    const arg = (stage as Record<string, unknown>)[op];

    if (!SUPPORTED_STAGES.includes(op)) {
      return fail(
        `Aggregation stage ${op} is not supported on SQL engines (supported: ${SUPPORTED_STAGES.join(", ")})`,
      );
    }

    switch (op) {
      case "$match": {
        if (hasGroup) {
          return fail(
            "$match after $group is not supported — it would need a HAVING clause; narrow the input with a $match before $group instead",
          );
        }
        if (hasProject || counted) return fail("$match must precede $count / $project");
        if (!arg || typeof arg !== "object" || Array.isArray(arg)) {
          return fail("$match requires a filter object");
        }
        const condition = dialect.match(arg as Record<string, unknown>);
        // A filter whose keys all map to nothing produces no condition — accepting it
        // silently would drop the intended restriction.
        if (!condition) {
          const names = Object.keys(arg as Record<string, unknown>).join(", ");
          return fail(`$match produced no condition for: ${names || "(empty filter)"}`);
        }
        matches.push(condition);
        break;
      }

      case "$group": {
        if (hasGroup) return fail("Only one $group stage is supported");
        if (counted || hasProject || orderBy.length > 0 || limit !== undefined) {
          return fail("$group must precede $sort / $skip / $limit / $count / $project");
        }
        if (!arg || typeof arg !== "object" || Array.isArray(arg)) {
          return fail("$group requires a specification object");
        }
        const spec = arg as Record<string, unknown>;
        if (!("_id" in spec))
          return fail("$group requires an _id key (use null for a single group)");

        const groupSelection: Record<string, SQL> = {};
        if (spec._id !== null) {
          const ref = fieldRef(spec._id);
          if (!ref) {
            return fail(
              'Only a scalar $group._id is supported (null or "$field"); compound keys return a nested document SQL rows cannot express',
            );
          }
          const keyExpr = dialect.field(ref);
          groupBy.push(keyExpr);
          groupSelection._id = keyExpr;
        }

        for (const [alias, accumulator] of Object.entries(spec)) {
          if (alias === "_id") continue;
          if (!accumulator || typeof accumulator !== "object" || Array.isArray(accumulator)) {
            return fail(`$group accumulator "${alias}" must be an object like { $sum: 1 }`);
          }
          const accOps = Object.keys(accumulator);
          if (accOps.length !== 1) {
            return fail(`$group accumulator "${alias}" must have exactly one operator`);
          }
          const accOp = accOps[0];
          const acc = groupAccumulator(
            accOp,
            (accumulator as Record<string, unknown>)[accOp],
            dialect,
          );
          if (!acc.ok) {
            // Refusals carry their own actionable message (e.g. the `$min`/`$max`
            // materialization hint); an unknown operator gets the supported list.
            return fail(
              acc.message.startsWith("Unsupported accumulator")
                ? `${acc.message} in $group.${alias} (supported: $sum, $avg, $min, $max, $count)`
                : acc.message,
            );
          }
          groupSelection[alias] = acc.expr;
        }
        if (Object.keys(groupSelection).length === 0) {
          return fail("$group has no accumulators — add at least one, e.g. { $sum: 1 }");
        }
        select = groupSelection;
        hasGroup = true;
        break;
      }

      case "$sort": {
        if (!arg || typeof arg !== "object" || Array.isArray(arg)) {
          return fail("$sort requires an object like { field: 1 }");
        }
        for (const [name, dir] of Object.entries(arg as Record<string, number>)) {
          if (dir !== 1 && dir !== -1) return fail(`$sort direction for "${name}" must be 1 or -1`);
          const expr = select?.[name] ?? dialect.field(name);
          orderBy.push(dir === 1 ? sql`${expr} ASC` : sql`${expr} DESC`);
        }
        break;
      }

      case "$skip": {
        if (typeof arg !== "number" || !Number.isInteger(arg) || arg < 0) {
          return fail("$skip requires a non-negative integer");
        }
        offset = arg;
        break;
      }

      case "$limit": {
        if (typeof arg !== "number" || !Number.isInteger(arg) || arg <= 0) {
          return fail("$limit requires a positive integer");
        }
        limit = arg;
        break;
      }

      case "$count": {
        if (hasGroup)
          return fail("$count after $group is not supported — use { $sum: 1 } inside $group");
        if (counted) return fail("Only one $count stage is supported");
        if (typeof arg !== "string" || arg.length === 0) {
          return fail('$count requires an output field name, e.g. { $count: "total" }');
        }
        select = { [arg]: sql`COUNT(*)` };
        counted = true;
        break;
      }

      case "$project": {
        if (!arg || typeof arg !== "object" || Array.isArray(arg)) {
          return fail("$project requires an object like { field: 1 }");
        }
        const entries = Object.entries(arg as Record<string, number>);
        if (entries.some(([, v]) => v !== 0 && v !== 1)) {
          return fail("Only include-only $project is supported ({ field: 1, _id: 0 })");
        }
        const includes = entries.filter(([name, v]) => v === 1 && name !== "_id");
        if (includes.length === 0)
          return fail("$project must include at least one field ({ field: 1 })");

        const projected: Record<string, SQL> = {};
        for (const [name] of includes) projected[name] = select?.[name] ?? dialect.field(name);
        // `_id` is kept unless explicitly excluded (MongoDB behaviour).
        const dropId = entries.some(([name, v]) => name === "_id" && v === 0);
        if (!dropId && select?._id) projected._id = select._id;
        select = projected;
        hasProject = true;
        break;
      }

      default:
        return fail(`Unhandled aggregation stage ${op}`);
    }
  }

  const where =
    matches.length === 0 ? undefined : matches.length === 1 ? matches[0] : and(...matches);
  return {
    ok: true,
    select,
    ...(where ? { where } : {}),
    ...(groupBy.length > 0 ? { groupBy } : {}),
    ...(orderBy.length > 0 ? { orderBy } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(offset !== undefined ? { offset } : {}),
  };
}
