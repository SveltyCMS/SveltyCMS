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
 */

import { parse, visit, type ASTNode, type FieldNode } from "graphql";

/** Default maximum query cost before rejection. */
export const DEFAULT_MAX_COST = 1000;

/** Dual-map sliding cache: O(1) eviction via window swap instead of O(N) iterator deletion. */
const MAX_CACHE_SIZE = 500;
let currentCache = new Map<string, CostAnalysisResult>();
let oldCache = new Map<string, CostAnalysisResult>();

export interface CostAnalysisResult {
  /** Total computed cost of the query */
  cost: number;
  /** Whether the query is within the allowed budget */
  allowed: boolean;
  /** List of top-level field names requested */
  fields: string[];
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
  // Dual-map cache: check current → old → promote → compute
  let cached = currentCache.get(queryString);
  if (cached) return cached;

  cached = oldCache.get(queryString);
  if (cached) {
    // Promote to fresh window
    currentCache.set(queryString, cached);
    return cached;
  }

  let document: ReturnType<typeof parse>;

  try {
    document = parse(queryString);
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
        const depth = ancestors.filter(
          (a) => (a as ASTNode).kind === "Field" || (a as ASTNode).kind === "OperationDefinition",
        ).length;

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
  };

  // O(1) sliding window: when current fills, swap — no iterator allocation
  if (currentCache.size >= MAX_CACHE_SIZE) {
    oldCache = currentCache;
    currentCache = new Map();
  }
  currentCache.set(queryString, result);

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
