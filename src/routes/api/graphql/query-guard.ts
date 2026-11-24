/**
 * @file src/routes/api/graphql/query-guard.ts
 * @description GraphQL DoS protection guard enforcing query depth, alias, and complexity caps.
 *
 * Features:
 * - Enforces `maxDepth` (default 6)
 * - Enforces `maxAliases` (default 15)
 * - Enforces `maxComplexity` (default 250)
 * - Optional `exemptIntrospection` for dev GraphiQL playground
 */

import { visit, type DocumentNode } from "graphql";
import { getOrParseDocument } from "./cost-analyzer";

export const DEFAULT_MAX_DEPTH = 6;
export const DEFAULT_MAX_ALIASES = 15;
export const DEFAULT_MAX_COMPLEXITY = 250;

export interface QueryGuardOptions {
  maxDepth?: number;
  maxAliases?: number;
  maxComplexity?: number;
  exemptIntrospection?: boolean;
}

export type QueryGuardViolationCode =
  | "GRAPHQL_DEPTH_EXCEEDED"
  | "GRAPHQL_ALIASES_EXCEEDED"
  | "GRAPHQL_COMPLEXITY_EXCEEDED";

export interface QueryGuardResult {
  allowed: boolean;
  depth: number;
  aliases: number;
  complexity: number;
  code?: QueryGuardViolationCode;
  reason?: string;
}

const isIntrospectionRoot = (name: string): boolean => name === "__schema" || name === "__type";

/**
 * Inspect a GraphQL query string and enforce depth, alias, and complexity caps.
 * Syntax errors are deferred to the GraphQL parser so standard error formatting applies.
 */
export function checkGraphqlQueryLimits(
  query: string,
  options: QueryGuardOptions = {},
): QueryGuardResult {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxAliases = options.maxAliases ?? DEFAULT_MAX_ALIASES;
  const maxComplexity = options.maxComplexity ?? DEFAULT_MAX_COMPLEXITY;
  const exemptIntrospection = options.exemptIntrospection ?? false;

  if (!query || !query.trim()) {
    return { allowed: true, depth: 0, aliases: 0, complexity: 0 };
  }

  let doc: DocumentNode;
  try {
    doc = getOrParseDocument(query);
  } catch {
    // Let Yoga's parser report syntax errors with standard GraphQL formatting.
    return { allowed: true, depth: 0, aliases: 0, complexity: 0 };
  }

  let currentDepth = 0;
  let maxDepthFound = 0;
  let aliases = 0;
  let complexity = 0;
  let introspectionDepth = 0;

  visit(doc, {
    Field: {
      enter(node) {
        if (
          exemptIntrospection &&
          (introspectionDepth > 0 || isIntrospectionRoot(node.name.value))
        ) {
          introspectionDepth++;
          return;
        }

        currentDepth++;
        if (currentDepth > maxDepthFound) {
          maxDepthFound = currentDepth;
        }

        if (node.alias) {
          aliases++;
        }

        complexity += node.selectionSet ? 2 : 1;
      },
      leave() {
        if (introspectionDepth > 0) {
          introspectionDepth--;
          return;
        }
        currentDepth--;
      },
    },
  });

  if (maxDepthFound > maxDepth) {
    return {
      allowed: false,
      depth: maxDepthFound,
      aliases,
      complexity,
      code: "GRAPHQL_DEPTH_EXCEEDED",
      reason: `Query depth ${maxDepthFound} exceeds maximum allowed depth of ${maxDepth}.`,
    };
  }

  if (aliases > maxAliases) {
    return {
      allowed: false,
      depth: maxDepthFound,
      aliases,
      complexity,
      code: "GRAPHQL_ALIASES_EXCEEDED",
      reason: `Query alias count ${aliases} exceeds maximum allowed aliases of ${maxAliases}.`,
    };
  }

  if (complexity > maxComplexity) {
    return {
      allowed: false,
      depth: maxDepthFound,
      aliases,
      complexity,
      code: "GRAPHQL_COMPLEXITY_EXCEEDED",
      reason: `Query complexity ${complexity} exceeds maximum allowed complexity of ${maxComplexity}.`,
    };
  }

  return {
    allowed: true,
    depth: maxDepthFound,
    aliases,
    complexity,
  };
}
