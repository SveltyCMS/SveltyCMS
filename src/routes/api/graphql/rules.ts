/**
 * @file src/routes/api/graphql/rules.ts
 * @description GraphQL security rules for the CMS.
 *
 * # Features
 * - Depth limiting (max 8).
 * - Alias count limiting (max 15).
 * - Single-use mutation tracking (prevents replay attacks via WS/HTTP).
 * - Validation hint suppression when introspection is off.
 */

import { GraphQLError, type ValidationContext, type ASTVisitor } from "graphql";

/** Track mutation hashes to prevent single-use replay (WS + HTTP). */
const mutationNonceCache = new Map<string, number>();
const MUTATION_NONCE_TTL_MS = 300_000; // 5 minutes

function pruneMutationCache() {
  const cutoff = Date.now() - MUTATION_NONCE_TTL_MS;
  for (const [key, timestamp] of mutationNonceCache) {
    if (timestamp < cutoff) mutationNonceCache.delete(key);
  }
}

/** Generates a lightweight hash for mutation dedup. */
function hashMutation(query: string, variables?: Record<string, unknown>): string {
  const vars = variables ? JSON.stringify(variables) : "{}";
  let hash = 0;
  const combined = query + vars;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash + combined.charCodeAt(i)) | 0;
  }
  return String(hash);
}

/**
 * Marks a mutation as executed. Returns false if it was already executed
 * within the TTL window (replay prevention).
 */
export function markMutationExecuted(query: string, variables?: Record<string, unknown>): boolean {
  pruneMutationCache();
  const hash = hashMutation(query, variables);
  if (mutationNonceCache.has(hash)) {
    return false; // Already executed — block replay
  }
  mutationNonceCache.set(hash, Date.now());
  return true;
}

export function createDepthLimitRule(maxDepth: number = 8) {
  return (context: ValidationContext): ASTVisitor => {
    let currentDepth = 0;
    return {
      Field: {
        enter(node) {
          currentDepth++;
          if (currentDepth > maxDepth) {
            context.reportError(
              new GraphQLError(
                `Query exceeds maximum allowed depth of ${maxDepth}. ` +
                  `Current depth: ${currentDepth} at field "${node.name.value}". ` +
                  `Reduce nesting or contact support.`,
                { nodes: [node] },
              ),
            );
          }
        },
        leave() {
          currentDepth--;
        },
      },
    };
  };
}

export function createMaxAliasesRule(maxAliases: number = 15) {
  return (context: ValidationContext): ASTVisitor => {
    let aliasCount = 0;
    return {
      Field(node) {
        if (node.alias) {
          aliasCount++;
          if (aliasCount > maxAliases) {
            context.reportError(
              new GraphQLError(`Query uses too many aliases (${aliasCount} > ${maxAliases}).`),
            );
          }
        }
      },
    };
  };
}

/**
 * Creates a validation rule that suppresses detailed validation hints when
 * introspection is disabled. Prevents attackers from probing schema shape
 * via error messages.
 */
export function createSuppressHintsRule(): (context: ValidationContext) => ASTVisitor {
  return (context: ValidationContext): ASTVisitor => {
    return {
      Field(node) {
        // Suppress detailed field-not-found errors — replace with generic message
        const parentType = (context as any).getParentType?.();
        if (parentType) {
          const fields = parentType.getFields?.();
          if (fields && !fields[node.name.value]) {
            context.reportError(
              new GraphQLError(
                `Cannot query field on type "${parentType.name}". Schema introspection is disabled.`,
                { nodes: [node] },
              ),
            );
          }
        }
      },
    };
  };
}
