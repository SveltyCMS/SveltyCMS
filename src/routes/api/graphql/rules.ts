/**
 * @file src/routes/api/graphql/rules.ts
 * @description GraphQL security rules for the CMS.
 */

import { GraphQLError, type ValidationContext, type ASTVisitor } from "graphql";

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
