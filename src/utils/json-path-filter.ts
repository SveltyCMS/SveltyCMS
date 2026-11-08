/**
 * @file src/utils/json-path-filter.ts
 * @description
 * Client-side JSON path filtering for media gallery (and similar) lists.
 *
 * ### Syntax
 * - Single clause: `metadata.camera = Canon`
 * - Multi-clause AND: `metadata.camera = Canon; metadata.iso = 100`
 * - Operators: `=` / `==` (eq), `!=` (neq), `~` / `*=` (contains), `>` / `<` / `>=` / `<=` (numeric)
 * - Quoted values: `metadata.camera = "Canon EOS"`
 *
 * ### Features:
 * - nested path walk (`a.b.c`)
 * - compiled path filter evaluation with LRU plan caching
 * - case-insensitive string compare
 * - multi-clause AND via `;` or `&&`
 * - pure function — easy to unit-test
 */

import { FastLRU } from "@utils/native-utils";

export type JsonPathOp = "eq" | "neq" | "contains" | "gt" | "lt" | "gte" | "lte";

export interface JsonPathClause {
  path: string;
  op: JsonPathOp;
  value: string;
}

export type PathSegment = string | number;

export interface CompiledClause {
  segments: PathSegment[];
  op: JsonPathOp;
  expectedRaw: string;
  expectedNum: number;
  expectedLower: string;
}

export type CompiledJsonPathFilter = (item: unknown) => boolean;

const CLAUSE_RE = /^\s*([A-Za-z0-9_.[\]]+)\s*(==|!=|>=|<=|~|\*=|=|>|<)\s*(.+?)\s*$/;
const ARRAY_INDEX_RE = /^([A-Za-z0-9_]+)\[(\d+)\]$/;

const MAX_FILTER_PLAN_CACHE = 500;
const filterPlanCache = new FastLRU<string, CompiledJsonPathFilter>({ max: MAX_FILTER_PLAN_CACHE });

function opFromToken(token: string): JsonPathOp {
  switch (token) {
    case "!=":
      return "neq";
    case "~":
    case "*=":
      return "contains";
    case ">":
      return "gt";
    case "<":
      return "lt";
    case ">=":
      return "gte";
    case "<=":
      return "lte";
    case "=":
    case "==":
    default:
      return "eq";
  }
}

/** Strip surrounding single/double quotes from a value. */
function unquote(raw: string): string {
  const t = raw.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Pre-parse dotted path expression into array segments (e.g. "tags[0]" -> ["tags", 0]) */
export function parsePathSegments(path: string): PathSegment[] {
  if (!path) return [];
  const parts = path.split(".").filter(Boolean);
  const segments: PathSegment[] = [];
  for (const part of parts) {
    const idxMatch = part.match(ARRAY_INDEX_RE);
    if (idxMatch) {
      const [, key, idxStr] = idxMatch;
      segments.push(key);
      segments.push(Number(idxStr));
    } else {
      segments.push(part);
    }
  }
  return segments;
}

/** Resolve pre-parsed segments on an object with zero regex evaluations. */
export function getBySegments(root: unknown, segments: readonly PathSegment[]): unknown {
  if (root == null) return undefined;
  let current: unknown = root;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (typeof seg === "number") {
      if (!Array.isArray(current) || seg < 0 || seg >= current.length) return undefined;
      current = current[seg];
    } else {
      if (!current || typeof current !== "object" || !(seg in (current as object))) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[seg];
    }
  }
  return current;
}

/**
 * Parse a filter expression into clauses.
 * Returns [] for empty input; ignores malformed clauses.
 */
export function parseJsonPathFilter(expression: string): JsonPathClause[] {
  if (!expression || !expression.trim()) return [];

  const parts = expression
    .split(/\s*(?:;|&&)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  const clauses: JsonPathClause[] = [];
  for (const part of parts) {
    const m = part.match(CLAUSE_RE);
    if (!m) continue;
    const [, path, opTok, rawVal] = m;
    if (!path || !opTok || rawVal === undefined) continue;
    clauses.push({
      path,
      op: opFromToken(opTok),
      value: unquote(rawVal),
    });
  }
  return clauses;
}

/** Resolve dotted path on an object (`metadata.exif.camera`). */
export function getByPath(root: unknown, path: string): unknown {
  if (root == null || !path) return undefined;
  return getBySegments(root, parsePathSegments(path));
}

function evaluateCompiledClause(actual: unknown, clause: CompiledClause): boolean {
  if (actual === undefined || actual === null) return false;

  const op = clause.op;
  if (op === "gt" || op === "lt" || op === "gte" || op === "lte") {
    const a = Number(actual);
    const b = clause.expectedNum;
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    if (op === "gt") return a > b;
    if (op === "lt") return a < b;
    if (op === "gte") return a >= b;
    return a <= b;
  }

  const aStr = String(actual).toLowerCase();
  if (op === "contains") return aStr.includes(clause.expectedLower);
  if (op === "neq") return aStr !== clause.expectedLower;
  return aStr === clause.expectedLower; // eq
}

/**
 * Compiles a JSON path filter expression into an evaluation plan function.
 * Caches compiled plans in a FastLRU cache to avoid repeated string splitting,
 * regex parsing, and path segmentation across large item lists.
 */
export function compileJsonPathFilter(expression: string): CompiledJsonPathFilter {
  const trimmed = expression?.trim() ?? "";
  if (!trimmed) {
    return () => true;
  }

  const cached = filterPlanCache.get(trimmed);
  if (cached) return cached;

  const rawClauses = parseJsonPathFilter(trimmed);
  if (rawClauses.length === 0) {
    const passAll: CompiledJsonPathFilter = () => true;
    filterPlanCache.set(trimmed, passAll);
    return passAll;
  }

  const compiledClauses: CompiledClause[] = rawClauses.map((c) => ({
    segments: parsePathSegments(c.path),
    op: c.op,
    expectedRaw: c.value,
    expectedNum: Number(c.value),
    expectedLower: c.value.toLowerCase(),
  }));

  const compiled: CompiledJsonPathFilter = (item: unknown) => {
    for (let i = 0; i < compiledClauses.length; i++) {
      const clause = compiledClauses[i];
      const actual = getBySegments(item, clause.segments);
      if (!evaluateCompiledClause(actual, clause)) return false;
    }
    return true;
  };

  filterPlanCache.set(trimmed, compiled);
  return compiled;
}

/**
 * Returns true if `item` matches all clauses (AND).
 * Empty expression / no valid clauses → true (no filtering).
 */
export function matchesJsonPathFilter(item: unknown, expression: string): boolean {
  if (!expression || !expression.trim()) return true;
  return compileJsonPathFilter(expression)(item);
}
