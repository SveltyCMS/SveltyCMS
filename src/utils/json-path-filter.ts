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
 * - case-insensitive string compare
 * - multi-clause AND via `;` or `&&`
 * - pure function — easy to unit-test
 */

export type JsonPathOp = "eq" | "neq" | "contains" | "gt" | "lt" | "gte" | "lte";

export interface JsonPathClause {
  path: string;
  op: JsonPathOp;
  value: string;
}

const CLAUSE_RE = /^\s*([A-Za-z0-9_.[\]]+)\s*(==|!=|>=|<=|~|\*=|=|>|<)\s*(.+?)\s*$/;

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
  const parts = path.split(".").filter(Boolean);
  let current: unknown = root;
  for (const part of parts) {
    // Support simple array index: tags[0]
    const idxMatch = part.match(/^([A-Za-z0-9_]+)\[(\d+)\]$/);
    if (idxMatch) {
      const [, key, idxStr] = idxMatch;
      if (!current || typeof current !== "object" || !(key in (current as object))) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
      const idx = Number(idxStr);
      if (!Array.isArray(current) || idx < 0 || idx >= current.length) return undefined;
      current = current[idx];
      continue;
    }
    if (!current || typeof current !== "object" || !(part in (current as object))) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function compareValues(actual: unknown, op: JsonPathOp, expected: string): boolean {
  if (actual === undefined || actual === null) return false;

  // Numeric ops
  if (op === "gt" || op === "lt" || op === "gte" || op === "lte") {
    const a = Number(actual);
    const b = Number(expected);
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    if (op === "gt") return a > b;
    if (op === "lt") return a < b;
    if (op === "gte") return a >= b;
    return a <= b;
  }

  const aStr = String(actual).toLowerCase();
  const bStr = expected.toLowerCase();

  if (op === "contains") return aStr.includes(bStr);
  if (op === "neq") return aStr !== bStr;
  return aStr === bStr; // eq
}

/**
 * Returns true if `item` matches all clauses (AND).
 * Empty expression / no valid clauses → true (no filtering).
 */
export function matchesJsonPathFilter(item: unknown, expression: string): boolean {
  const clauses = parseJsonPathFilter(expression);
  if (clauses.length === 0) return true;

  for (const clause of clauses) {
    const actual = getByPath(item, clause.path);
    if (!compareValues(actual, clause.op, clause.value)) return false;
  }
  return true;
}
