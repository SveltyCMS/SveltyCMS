/**
 * @file tests/unit/api/graphql-security.test.ts
 * @description GraphQL Whitebox Native Security Rules Tests
 */
import { describe, it, expect } from "vitest";
import { parse, validate, buildSchema, NoSchemaIntrospectionCustomRule } from "graphql";

// This simulates the schema we have
const schemaDefinition = `
  type User {
    _id: String
    email: String
    friends: [User]
  }
  type Query {
    users: [User]
    me: User
  }
`;
const schema = buildSchema(schemaDefinition);

// The rules we want to test
// Depending on how your +server.ts is built, you might import these.
// We inline them here or import them securely if they are exported.
import { createDepthLimitRule, createMaxAliasesRule } from "@src/routes/api/graphql/rules";

describe("GraphQL Whitebox Native Security Rules", () => {
  it("should allow a normal admin query (depth < limit)", () => {
    const query = `
          query {
            users {
              _id
              email
            }
          }
        `;
    const ast = parse(query);
    const errors = validate(schema, ast, [createDepthLimitRule(8)]);
    expect(errors).toHaveLength(0);
  });

  it("should reject a deep recursive query (depth > maxDepth)", () => {
    const query = `
          query {
            users {
              friends {
                friends {
                  friends {
                    friends {
                      friends {
                        friends {
                          friends {
                            friends {
                              _id
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `;
    const ast = parse(query);
    const errors = validate(schema, ast, [createDepthLimitRule(8)]);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes("Query exceeds maximum allowed depth"))).toBe(
      true,
    );
  });

  it("should allow a query with acceptable aliases", () => {
    const query = `
          query {
            u1: users { _id }
            u2: users { _id }
          }
        `;
    const ast = parse(query);
    const errors = validate(schema, ast, [createMaxAliasesRule(15)]);
    expect(errors).toHaveLength(0);
  });

  it("should reject a query with too many aliases", () => {
    // Build a query with 16 aliases
    let queryFields = "";
    for (let i = 0; i < 16; i++) {
      queryFields += `a${i}: users { _id }\n`;
    }
    const query = `query { ${queryFields} }`;

    const ast = parse(query);
    const errors = validate(schema, ast, [createMaxAliasesRule(15)]);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("Query uses too many aliases");
  });

  it("should reject an introspection query when the introspection block rule is applied", () => {
    const query = `
          query {
            __schema {
              types {
                name
              }
            }
          }
        `;
    const ast = parse(query);
    // The NoSchemaIntrospectionCustomRule is used in prod
    const errors = validate(schema, ast, [NoSchemaIntrospectionCustomRule]);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.toLowerCase().includes("introspection"))).toBe(true);
  });
});
