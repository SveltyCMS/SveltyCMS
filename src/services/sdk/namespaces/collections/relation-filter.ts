/**
 * @file src/services/sdk/namespaces/collections/relation-filter.ts
 * @description
 * Compiles relation-level filter operators (`$some` / `$none` / `$every`) into
 * capped ID lookups before the synchronous SQL query builder runs.
 *
 * Relation fields store target IDs, so an operator on the relation is answered
 * by resolving IDs in the target collection first and then feeding the parent
 * query a plain `$in` / `$nin`. The SQL query builder stays synchronous: every
 * async hop happens here.
 *
 * ### Features:
 * - `RELATION_FANOUT` hard cap (500) — exceeding it throws, never truncates
 * - typed `RelationFilterError` (`RELATION_FANOUT_EXCEEDED` / `RELATION_FIELD_UNKNOWN`)
 * - `$and` / `$or` (and `AND` / `OR`, `$not`) nesting preserved, never flattened
 * - `$none` / `$every` emit a null clause so a missing relation passes on SQL too
 * - target guarded fields are stripped through `stripGuardedFilter` when the
 *   caller supplies a target-schema resolver (no blind filter oracle)
 * - ID-only projections (`fields: ["_id"]`, `limit: cap + 1`) — full documents
 *   are never loaded
 */

import type { BaseEntity, DatabaseId, Schema } from "@src/content/types";
import type {
  DatabaseResult,
  FindOptions,
  ICrudAdapter,
  QueryFilter,
} from "@src/databases/db-interface";
import { AppError, raise, rethrow } from "@utils/error-handling";
import { blockedGuardedNames, stripGuardedFilter } from "@utils/guarded-query";
import { normalizeRelationshipFilter } from "./read-pipeline";

/**
 * Hard fan-out cap for a single relation lookup. A target collection matching
 * more rows than this cannot be represented as an `$in` list without changing
 * `some` / `none` / `every` semantics, so the query is rejected instead of
 * silently truncated (a truncated `$nin` would wrongly pass rows).
 */
export const RELATION_FANOUT = 500;

export type RelationFilterErrorCode =
  | "RELATION_FANOUT_EXCEEDED"
  | "RELATION_FIELD_UNKNOWN"
  | "RELATION_FILTER_UNSUPPORTED";

/** Typed failure for an unusable relation filter (stable `code` for callers). */
export class RelationFilterError extends AppError {
  declare readonly code: RelationFilterErrorCode;

  constructor(message: string, code: RelationFilterErrorCode) {
    super(message, 400, code);
    this.name = "RelationFilterError";
  }
}

export interface CompileRelationFiltersOptions {
  dbAdapter: Pick<ICrudAdapter, "findMany">;
  /** Logical collection id → physical table / model name (`collectionTableName`). */
  getCollectionName: (collectionId: string) => string;
  /**
   * Resolve the target schema so guarded target fields can never become a
   * blind filter oracle. Optional for callers without schema access.
   */
  resolveTargetSchema?: (collectionId: string) => Promise<Schema | null>;
  tenantId?: DatabaseId | null;
  user?: { _id?: unknown; role?: unknown; isAdmin?: unknown } | null;
  system?: boolean;
}

type FilterRecord = Record<string, unknown>;

type RelationOperator = "$some" | "$none" | "$every";

const RELATION_OPERATOR_KEYS = new Set(["$some", "some", "$none", "none", "$every", "every"]);

const LOGICAL_FILTER_KEYS = new Set(["$and", "$or", "$not", "AND", "OR", "NOT"]);

/** Field-level operators accepted against a target row id (plain or `$`-prefixed). */
const ID_OPERATOR_ALIASES: Record<string, string> = {
  equals: "$eq",
  $eq: "$eq",
  eq: "$eq",
  not: "$ne",
  $ne: "$ne",
  ne: "$ne",
  in: "$in",
  $in: "$in",
  nin: "$nin",
  $nin: "$nin",
  gt: "$gt",
  $gt: "$gt",
  gte: "$gte",
  $gte: "$gte",
  lt: "$lt",
  $lt: "$lt",
  lte: "$lte",
  $lte: "$lte",
  contains: "$contains",
  $contains: "$contains",
};

function relationOperatorOf(key: string): RelationOperator | null {
  if (key === "$some" || key === "some") return "$some";
  if (key === "$none" || key === "none") return "$none";
  if (key === "$every" || key === "every") return "$every";
  return null;
}

/** Widget names arrive PascalCase (`Relation`) or as kebab palette keys (`relation-list`). */
function widgetNameOf(field: FilterRecord): string {
  const widget = field.widget;
  let raw = "";
  if (typeof widget === "string") {
    raw = widget;
  } else if (widget && typeof widget === "object") {
    const record = widget as FilterRecord;
    raw =
      typeof record.Name === "string"
        ? record.Name
        : typeof record.name === "string"
          ? record.name
          : "";
  }
  if (!raw) return "";
  return raw
    .replace(/[-_\s]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\s+/g, "");
}

/** Target collection id for a relation field, or null when the field is not a relation. */
function relationTargetOf(field: FilterRecord): string | null {
  const widget = widgetNameOf(field);
  const type = typeof field.type === "string" ? field.type : "";
  const isRelation =
    widget === "Relation" || widget === "RelationList" || type === "relation" || type === "join";
  if (!isRelation) return null;

  const join = field.join && typeof field.join === "object" ? (field.join as FilterRecord) : null;
  const candidates = [
    field.collection,
    field.relation,
    field.relationTarget,
    field.targetCollection,
    join?.collection,
    join?.target,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate) return candidate;
  }
  return null;
}

function findField(schema: Schema, name: string): FilterRecord | null {
  const fields = (schema.fields ?? []) as unknown[];
  for (const entry of fields) {
    if (!entry || typeof entry !== "object") continue;
    const field = entry as FilterRecord;
    if (field.db_fieldName === name || field.name === name || field.label === name) {
      return field;
    }
  }
  return null;
}

function isRelationOperatorObject(value: unknown): value is FilterRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as FilterRecord;
  for (const key in record) {
    if (Object.hasOwn(record, key) && RELATION_OPERATOR_KEYS.has(key)) return true;
  }
  return false;
}

function containsRelationOperator(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (containsRelationOperator(entry)) return true;
    }
    return false;
  }
  const record = value as FilterRecord;
  for (const key in record) {
    if (!Object.hasOwn(record, key)) continue;
    if (RELATION_OPERATOR_KEYS.has(key)) return true;
    if (containsRelationOperator(record[key])) return true;
  }
  return false;
}

/**
 * Compile every relation operator in a list/query filter into capped ID lists.
 *
 * Returns the input unchanged (same reference) when the filter has no relation
 * operator, so the hot path pays one structural scan and no allocation.
 */
export async function compileRelationFilters<T>(
  filter: T,
  schema: Schema,
  options: CompileRelationFiltersOptions,
): Promise<T> {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return filter;
  if (!containsRelationOperator(filter)) return filter;
  return (await walkFilter(filter as FilterRecord, schema, options)) as T;
}

async function walkFilter(
  filter: FilterRecord,
  schema: Schema,
  options: CompileRelationFiltersOptions,
): Promise<FilterRecord> {
  const fragments: FilterRecord[] = [];
  for (const key of Object.keys(filter)) {
    const value = filter[key];

    if (LOGICAL_FILTER_KEYS.has(key)) {
      fragments.push({ [key]: await compileLogicalValue(value, schema, options) });
      continue;
    }

    if (isRelationOperatorObject(value)) {
      fragments.push(...(await compileFieldOperators(key, value, schema, options)));
      continue;
    }

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      containsRelationOperator(value)
    ) {
      fragments.push({ [key]: await walkFilter(value as FilterRecord, schema, options) });
      continue;
    }

    fragments.push({ [key]: value });
  }
  return andFilters(fragments);
}

async function compileLogicalValue(
  value: unknown,
  schema: Schema,
  options: CompileRelationFiltersOptions,
): Promise<unknown> {
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const entry of value) {
      out.push(
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? await walkFilter(entry as FilterRecord, schema, options)
          : entry,
      );
    }
    return out;
  }
  if (value && typeof value === "object") {
    return await walkFilter(value as FilterRecord, schema, options);
  }
  return value;
}

/** Compile all operators on one relation field; unrelated keys pass through as AND clauses. */
async function compileFieldOperators(
  fieldName: string,
  operators: FilterRecord,
  schema: Schema,
  options: CompileRelationFiltersOptions,
): Promise<FilterRecord[]> {
  const field = findField(schema, fieldName);
  const target = field ? relationTargetOf(field) : null;
  if (!field || !target) {
    throw new RelationFilterError(
      `Relation operator on '${fieldName}' — the field is not a relation with a target collection`,
      "RELATION_FIELD_UNKNOWN",
    );
  }

  const fragments: FilterRecord[] = [];
  let passthrough: FilterRecord | null = null;
  for (const key of Object.keys(operators)) {
    const operator = relationOperatorOf(key);
    if (!operator) {
      // A non-relation operator in the same object (`{ $some: …, $ne: … }`)
      // stays a plain condition on the relation id.
      if (!passthrough) passthrough = {};
      passthrough[key] = operators[key];
      continue;
    }
    const fragment = await compileRelationOperator(
      fieldName,
      operator,
      operators[key],
      target,
      options,
    );
    if (Object.keys(fragment).length > 0) fragments.push(fragment);
  }
  if (passthrough) fragments.push({ [fieldName]: passthrough });
  return fragments;
}

async function compileRelationOperator(
  fieldName: string,
  operator: RelationOperator,
  condition: unknown,
  target: string,
  options: CompileRelationFiltersOptions,
): Promise<FilterRecord> {
  if (operator === "$some") {
    const ids = await resolveTargetIds(condition, target, options, false);
    return { [fieldName]: { $in: ids } };
  }

  const ids =
    operator === "$none"
      ? await resolveTargetIds(condition, target, options, false)
      : await resolveTargetIds(condition, target, options, true);

  // No excluded ids → the condition is vacuously true for every parent row.
  if (ids.length === 0) return {};

  // `$nin` alone drops NULL rows on SQL (`NOT IN` is NULL-propagating) — the
  // explicit null branch keeps "missing relation has no matches" semantics.
  return {
    $or: [{ [fieldName]: { $nin: ids } }, { [fieldName]: null }],
  };
}

async function resolveTargetIds(
  condition: unknown,
  target: string,
  options: CompileRelationFiltersOptions,
  negate: boolean,
): Promise<string[]> {
  const targetFilter = buildTargetFilter(condition);
  if (targetFilter === null) return [];
  const resolved = negate ? negateTargetFilter(targetFilter) : targetFilter;
  // `null` here means "matches nothing" — either no rows do not satisfy the
  // condition, or the condition's complement matches no rows.
  if (resolved === null) return [];
  return await lookupIds(resolved, target, options);
}

/**
 * Translate the operator's value into a target-collection filter.
 *
 * - scalar / array → id equality / `$in` (the in-memory `documentMatches`
 *   semantics for relation ids)
 * - object whose keys are all field operators → an id operator object
 * - any other object → a filter on the target row's own fields
 */
function buildTargetFilter(condition: unknown): FilterRecord | null {
  if (Array.isArray(condition)) return { _id: { $in: condition } };
  if (condition === null || condition === undefined) return { _id: null };
  if (typeof condition !== "object") return { _id: condition };

  const record = condition as FilterRecord;
  const keys = Object.keys(record);
  if (keys.length === 0) return {};

  let idOperatorsOnly = true;
  for (const key of keys) {
    if (relationOperatorOf(key)) {
      throw new RelationFilterError(
        `Nested relation operator '${key}' is not supported inside a relation condition`,
        "RELATION_FILTER_UNSUPPORTED",
      );
    }
    if (!ID_OPERATOR_ALIASES[key]) {
      idOperatorsOnly = false;
      break;
    }
  }
  if (!idOperatorsOnly) return record;

  const operators: FilterRecord = {};
  for (const key of keys) {
    const canonical = ID_OPERATOR_ALIASES[key];
    if (!canonical) {
      throw new RelationFilterError(
        `Unsupported relation condition operator '${key}'`,
        "RELATION_FILTER_UNSUPPORTED",
      );
    }
    operators[canonical] = record[key];
  }
  return { _id: operators };
}

async function lookupIds(
  targetFilter: FilterRecord,
  target: string,
  options: CompileRelationFiltersOptions,
): Promise<string[]> {
  let query = normalizeRelationshipFilter(targetFilter) as FilterRecord;

  if (options.resolveTargetSchema) {
    const targetSchema = await options.resolveTargetSchema(target).catch((err: unknown) => {
      rethrow(err);
      raise(500, `Relation target schema '${target}' could not be resolved`, "DATABASE_ERROR");
    });
    if (targetSchema) {
      const guardedQuery = stripGuardedFilter(
        query,
        blockedGuardedNames(targetSchema, options.user ?? null, options.system),
      ) as FilterRecord;
      // Never turn a guarded condition into `{}` (which would match every target
      // row): a removed key means the caller is not allowed to filter on it.
      if (guardedQuery !== query) {
        throw new RelationFilterError(
          `Relation condition on '${target}' references a field the caller may not filter`,
          "RELATION_FIELD_UNKNOWN",
        );
      }
      query = guardedQuery;
    }
  }

  const collection = options.getCollectionName(target);
  const lookupOptions = {
    tenantId: options.tenantId,
    limit: RELATION_FANOUT + 1,
    fields: ["_id"],
    ...(options.user === undefined ? {} : { user: options.user }),
  } as FindOptions<BaseEntity> & { user?: unknown };

  const result: DatabaseResult<BaseEntity[]> = await options.dbAdapter
    .findMany<BaseEntity>(collection, query as QueryFilter<BaseEntity>, lookupOptions)
    .catch((err: unknown) => {
      rethrow(err);
      return raise(500, `Relation lookup for '${target}' failed`, "DATABASE_ERROR");
    });

  if (!result.success) {
    raise(500, result.message || `Relation lookup for '${target}' failed`, "DATABASE_ERROR");
  }
  if (!Array.isArray(result.data)) {
    raise(500, `Relation lookup for '${target}' failed`, "DATABASE_ERROR");
  }
  if (result.data.length > RELATION_FANOUT) {
    throw new RelationFilterError(
      `Relation lookup for '${target}' exceeded ${RELATION_FANOUT} rows — narrow the condition`,
      "RELATION_FANOUT_EXCEEDED",
    );
  }

  const ids: string[] = [];
  for (const row of result.data) {
    const rawId = row && typeof row === "object" ? (row as { _id?: unknown })._id : row;
    if (typeof rawId === "string" && rawId) ids.push(rawId);
    else if (typeof rawId === "number") ids.push(String(rawId));
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Negation (for `$every` — the target rows that do NOT satisfy the condition)
// ---------------------------------------------------------------------------

function asFilterRecord(value: unknown): FilterRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RelationFilterError(
      "Relation condition branches must be filter objects",
      "RELATION_FILTER_UNSUPPORTED",
    );
  }
  return value as FilterRecord;
}

/** `null` means "matches nothing". */
function negateTargetFilter(filter: FilterRecord): FilterRecord | null {
  const clauses: FilterRecord[] = [];
  for (const key of Object.keys(filter)) {
    const value = filter[key];

    if (key === "$and" || key === "AND") {
      if (!Array.isArray(value)) {
        throw new RelationFilterError(
          `'${key}' must be an array in a relation condition`,
          "RELATION_FILTER_UNSUPPORTED",
        );
      }
      const negated = negateAndBranch(value);
      if (negated !== null) clauses.push(negated);
      continue;
    }

    if (key === "$or" || key === "OR") {
      if (!Array.isArray(value)) {
        throw new RelationFilterError(
          `'${key}' must be an array in a relation condition`,
          "RELATION_FILTER_UNSUPPORTED",
        );
      }
      const negated = negateOrBranch(value);
      // One branch matching everything makes the OR match everything, so its
      // complement matches nothing.
      if (negated === null) return null;
      clauses.push(negated);
      continue;
    }

    if (key === "$not" || key === "NOT") {
      clauses.push(asFilterRecord(value));
      continue;
    }

    clauses.push(negateFieldClause(key, value));
  }
  return orFilters(clauses);
}

function negateAndBranch(branches: unknown[]): FilterRecord | null {
  const negations: FilterRecord[] = [];
  for (const branch of branches) {
    const negated = negateTargetFilter(asFilterRecord(branch));
    // A branch that matches everything contributes nothing to the OR of negations.
    if (negated !== null) negations.push(negated);
  }
  return orFilters(negations);
}

function negateOrBranch(branches: unknown[]): FilterRecord | null {
  const negations: FilterRecord[] = [];
  for (const branch of branches) {
    const negated = negateTargetFilter(asFilterRecord(branch));
    if (negated === null) return null;
    negations.push(negated);
  }
  return andFilters(negations);
}

function negateFieldClause(field: string, value: unknown): FilterRecord {
  if (Array.isArray(value)) return orNull(field, { [field]: { $nin: value } });
  if (value === null) return { [field]: { $ne: null } };
  if (typeof value !== "object") {
    return orNull(field, { [field]: { $ne: value } });
  }

  const record = value as FilterRecord;
  const keys = Object.keys(record);
  if (keys.length === 0) return {};

  const negations: FilterRecord[] = [];
  for (const key of keys) {
    const operator = ID_OPERATOR_ALIASES[key];
    if (!operator) {
      // Nested object value — the in-memory evaluator treats it as an equality
      // comparison, so the complement is a `$ne` (plus the SQL null branch).
      negations.push(orNull(field, { [field]: { $ne: record } }));
      continue;
    }
    negations.push(negateIdOperator(field, operator, record[key]));
  }
  return orFilters(negations) ?? {};
}

function negateIdOperator(field: string, operator: string, value: unknown): FilterRecord {
  switch (operator) {
    case "$eq":
      return orNull(field, { [field]: { $ne: value } });
    case "$ne":
      return { [field]: { $eq: value } };
    case "$in":
      if (!Array.isArray(value)) {
        throw new RelationFilterError(
          "Relation condition '$in' requires an array",
          "RELATION_FILTER_UNSUPPORTED",
        );
      }
      return orNull(field, { [field]: { $nin: value } });
    case "$nin":
      return { [field]: { $in: Array.isArray(value) ? value : [] } };
    case "$gt":
      return orNull(field, { [field]: { $lte: value } });
    case "$gte":
      return orNull(field, { [field]: { $lt: value } });
    case "$lt":
      return orNull(field, { [field]: { $gte: value } });
    case "$lte":
      return orNull(field, { [field]: { $gt: value } });
    default:
      throw new RelationFilterError(
        `Cannot negate operator '${operator}' in an $every relation condition`,
        "RELATION_FILTER_UNSUPPORTED",
      );
  }
}

/** `base || field IS NULL` — missing fields satisfy the negated condition. */
function orNull(field: string, base: FilterRecord): FilterRecord {
  return { $or: [base, { [field]: null }] };
}

function orFilters(filters: FilterRecord[]): FilterRecord | null {
  const parts = filters.filter((entry) => Object.keys(entry).length > 0);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return { $or: parts };
}

function andFilters(filters: FilterRecord[]): FilterRecord {
  const parts = filters.filter((entry) => Object.keys(entry).length > 0);
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}
