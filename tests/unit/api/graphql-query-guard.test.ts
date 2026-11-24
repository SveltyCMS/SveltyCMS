/**
 * @file tests/unit/api/graphql-query-guard.test.ts
 * @description Unit tests for Week 10 GraphQL DoS protection (depth, alias, and complexity caps).
 */

import { describe, it, expect } from "vitest";
import {
  checkGraphqlQueryLimits,
  DEFAULT_MAX_ALIASES,
  DEFAULT_MAX_COMPLEXITY,
  DEFAULT_MAX_DEPTH,
} from "@src/routes/api/graphql/query-guard";

describe("GraphQL query-guard", () => {
  it("allows a normal query within default limits", () => {
    const query = `
      query {
        posts {
          id
          title
          author {
            name
          }
        }
      }
    `;
    const result = checkGraphqlQueryLimits(query);
    expect(result.allowed).toBe(true);
    expect(result.depth).toBe(3);
    expect(result.aliases).toBe(0);
    expect(result.complexity).toBe(7);
  });

  it("rejects queries exceeding maxDepth (default 6)", () => {
    // Depth 7: a -> b -> c -> d -> e -> f -> g
    const deepQuery = `
      query {
        a { b { c { d { e { f { g } } } } } }
      }
    `;
    const result = checkGraphqlQueryLimits(deepQuery);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("GRAPHQL_DEPTH_EXCEEDED");
    expect(result.depth).toBe(7);
    expect(DEFAULT_MAX_DEPTH).toBe(6);
  });

  it("allows queries at exact maxDepth (6)", () => {
    const exactQuery = `
      query {
        a { b { c { d { e { f } } } } }
      }
    `;
    const result = checkGraphqlQueryLimits(exactQuery);
    expect(result.allowed).toBe(true);
    expect(result.depth).toBe(6);
  });

  it("rejects queries exceeding maxAliases (default 15)", () => {
    const aliasedFields = Array.from({ length: 16 }, (_, i) => `a${i}: id`).join("\n");
    const aliasQuery = `query { ${aliasedFields} }`;
    const result = checkGraphqlQueryLimits(aliasQuery);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("GRAPHQL_ALIASES_EXCEEDED");
    expect(result.aliases).toBe(16);
    expect(DEFAULT_MAX_ALIASES).toBe(15);
  });

  it("rejects queries exceeding maxComplexity (default 250)", () => {
    // 251 scalar fields -> complexity 251 > 250
    const manyFields = Array.from({ length: 251 }, (_, i) => `f${i}`).join("\n");
    const complexQuery = `query { ${manyFields} }`;
    const result = checkGraphqlQueryLimits(complexQuery);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("GRAPHQL_COMPLEXITY_EXCEEDED");
    expect(result.complexity).toBe(251);
    expect(DEFAULT_MAX_COMPLEXITY).toBe(250);
  });

  it("supports custom limits and exemptIntrospection", () => {
    const introspectionQuery = `
      query {
        __schema {
          types {
            fields {
              type {
                ofType {
                  ofType {
                    name
                  }
                }
              }
            }
          }
        }
      }
    `;
    expect(checkGraphqlQueryLimits(introspectionQuery).allowed).toBe(false);
    expect(checkGraphqlQueryLimits(introspectionQuery, { exemptIntrospection: true }).allowed).toBe(
      true,
    );
    expect(checkGraphqlQueryLimits("query { a { b } }", { maxDepth: 1 }).allowed).toBe(false);
  });

  it("defers syntax errors to the GraphQL parser", () => {
    const result = checkGraphqlQueryLimits("query { broken(");
    expect(result.allowed).toBe(true);
  });
});
