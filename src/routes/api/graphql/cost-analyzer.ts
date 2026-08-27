/**
 * @file src/routes/api/graphql/cost-analyzer.ts
 * @description GraphQL query cost analysis middleware.
 *
 * Walks the parsed GraphQL AST and assigns costs:
 * - Scalar fields = 1
 * - Connection/list fields = 10 × number of child selections
 *
 * Rejects queries exceeding a configurable budget (default: 1000).
 *
 * Features:
 * - AST-based cost calculation
 * - Configurable max budget
 * - Descriptive over-budget error messages
 * - Shared parse cache + single-field matcher for the Yoga bypass
 */

import { parse, visit, type ASTNode, type DocumentNode, type FieldNode } from "graphql";

/** Default maximum query cost before rejection. */
export const DEFAULT_MAX_COST = 1000;

/** Dual-map sliding cache: O(1) eviction via window swap instead of O(N) iterator deletion. */
const MAX_CACHE_SIZE = 500;
let currentCache = new Map<string, CostAnalysisResult>();
let oldCache = new Map<string, CostAnalysisResult>();
const MAX_AST_CACHE = 1000;
const astCache = new Map<string, DocumentNode>();

/** Shared parse cache (comments stripped). Same DocumentNode → graphql-jit compile hits. */
export function getOrParseDocument(rawQuery: string): DocumentNode {
  const key = normalizeQueryString(rawQuery);
  let cached = astCache.get(key);
  if (cached) return cached;
  cached = parse(rawQuery);
  if (astCache.size >= MAX_AST_CACHE) {
    const oldestKey = astCache.keys().next().value;
    if (oldestKey !== undefined) astCache.delete(oldestKey);
  }
  astCache.set(key, cached);
  return cached;
}

export interface MatchedCollectionQuery {
  field: string;
  selections: string[];
  limit: number;
  page: number;
}

/**
 * Detect a single-root-field query (optional `query Name`) for the Yoga bypass.
 * Comments/whitespace are normalized first. Returns null for mutations / multi-field ops.
 */
export function matchSingleFieldQuery(
  rawQuery: string,
): { field: string; selections: string[] } | null {
  const normalized = normalizeQueryString(rawQuery);
  const match =
    /^(?:query(?:\s+[A-Za-z_][A-Za-z0-9_]*)?)?\s*\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\{\s*([^}]*)\s*\})?\s*\}\s*$/.exec(
      normalized,
    );
  if (!match) return null;
  const field = match[1];
  const inner = (match[2] ?? "").trim();
  const selections = inner ? inner.split(/\s+/).filter(Boolean) : [];
  return { field, selections };
}

/**
 * Detect a single collection query with optional pagination/limit/page arguments.
 * Rejects nested selections (relations) or complex directives so they fall through to Yoga.
 */
export function matchCollectionQuery(rawQuery: string): MatchedCollectionQuery | null {
  const normalized = normalizeQueryString(rawQuery);
  const match =
    /^(?:query(?:\s+[A-Za-z_][A-Za-z0-9_]*)?)?\s*\{\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*\(([^)]*)\))?\s*(?:\{\s*([^}]*)\s*\})?\s*\}\s*$/.exec(
      normalized,
    );
  if (!match) return null;
  const field = match[1];
  const rawArgs = (match[2] ?? "").trim();
  const inner = (match[3] ?? "").trim();

  // If inner contains { or }, it has nested sub-selections (relational queries) -> Yoga
  if (inner.includes("{") || inner.includes("}")) return null;

  const selections = inner ? inner.replace(/,/g, " ").split(/\s+/).filter(Boolean) : [];

  let limit = 50;
  let page = 1;

  if (rawArgs) {
    const limitMatch = /limit\s*:\s*(\d+)/.exec(rawArgs);
    if (limitMatch) limit = Number(limitMatch[1]);

    const pageMatch = /page\s*:\s*(\d+)/.exec(rawArgs);
    if (pageMatch) page = Number(pageMatch[1]);
  }

  return { field, selections, limit, page };
}

export interface CostAnalysisResult {
  /** Total computed cost of the query */
  cost: number;
  /** Whether the query is within the allowed budget */
  allowed: boolean;
  /** List of top-level field names requested */
  fields: string[];
  /** Parsed document from the single parse used for cost analysis (reuse on the request path). */
  document?: DocumentNode;
}

/** Normalizes a GraphQL query string by stripping comments and collapsing whitespace for fast cache matching */
export function normalizeQueryString(str: string): string {
  if (!str) return "";
  // Strip single-line comments (# to newline) and collapse multiple whitespace
  return str
    .replace(/#[^\r\n]*/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Analyzes a raw GraphQL query string and computes its cost.
 *
 * Cost model:
 * - Scalar leaf fields (no sub-selections): cost = 1
 * - Object/connection fields (with sub-selections): cost = 10 × child count
 *
 * @param queryString - The raw GraphQL query or mutation string
 * @param maxCost - Maximum allowed cost (defaults to DEFAULT_MAX_COST)
 * @returns Cost analysis result with cost, allowed flag, and field list
 */
export function analyzeQueryCost(
  queryString: string,
  maxCost: number = DEFAULT_MAX_COST,
): CostAnalysisResult {
  const normalized = normalizeQueryString(queryString);
  // Dual-map cache: check current → old → promote → compute
  let cached = currentCache.get(normalized);
  if (cached) return cached;

  cached = oldCache.get(normalized);
  if (cached) {
    // Promote to fresh window
    currentCache.set(normalized, cached);
    return cached;
  }

  let document: DocumentNode;

  try {
    document = getOrParseDocument(queryString);
  } catch {
    // If parsing fails, return a safe result — the GraphQL engine will
    // provide its own validation error downstream.
    return { cost: 0, allowed: true, fields: [] };
  }

  let totalCost = 0;
  const fields: string[] = [];

  visit(document, {
    Field: {
      enter(node: FieldNode, _key, _parent, _path, ancestors) {
        const name = node.name.value;

        // Determine if this is a top-level query/mutation field
        let depth = 0;
        for (let i = 0; i < ancestors.length; i++) {
          const aKind = (ancestors[i] as ASTNode)?.kind;
          if (aKind === "Field" || aKind === "OperationDefinition") {
            depth++;
          }
        }

        if (depth <= 2) {
          fields.push(name);
        }

        // Check if this field has sub-selections (object/connection type)
        const hasSubSelection =
          node.selectionSet &&
          node.selectionSet.selections &&
          node.selectionSet.selections.length > 0;

        if (hasSubSelection) {
          // Connection/object field: cost = 10 × number of child fields
          const childCount = node.selectionSet!.selections.filter((s) => s.kind === "Field").length;
          totalCost += 10 * Math.max(1, childCount);
        } else {
          // Scalar leaf field: cost = 1
          totalCost += 1;
        }
      },
    },
  });

  const result: CostAnalysisResult = {
    cost: totalCost,
    allowed: totalCost <= maxCost,
    fields,
    document,
  };

  // O(1) sliding window: when current fills, swap — no iterator allocation
  if (currentCache.size >= MAX_CACHE_SIZE) {
    oldCache = currentCache;
    currentCache = new Map();
  }
  currentCache.set(normalized, result);

  return result;
}

/**
 * Returns a descriptive error message for an over-budget query.
 *
 * @param cost - The computed query cost
 * @param maxCost - The maximum allowed budget
 * @returns Human-readable error message
 */
export function formatCostError(cost: number, maxCost: number): string {
  return (
    `GraphQL query cost (${cost}) exceeds the maximum allowed budget (${maxCost}). ` +
    `Reduce the number of requested fields, limit nesting depth, ` +
    `or use pagination for connection fields.`
  );
}
