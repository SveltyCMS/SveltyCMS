/**
 * @file tests/unit/api/graphql-security.test.ts
 * @description GraphQL whitebox security: depth/aliases/introspection + dispatcher auth gate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { parse, validate, buildSchema, NoSchemaIntrospectionCustomRule } from "graphql";
import { createDepthLimitRule, createMaxAliasesRule } from "@src/routes/api/graphql/rules";
import { invokeGraphql } from "../utils/mock-event";
import { createMockUser } from "../utils/mock-factories";

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

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    crud: {},
    auth: {},
    media: {},
    system: {},
    collection: {},
  },
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn(),
  isDbConnected: vi.fn().mockReturnValue(true),
  getAuth: vi.fn().mockReturnValue({}),
}));

vi.mock("@utils/tenant", () => ({
  isMultiTenantEnabled: vi.fn().mockReturnValue(false),
  getTenantIdFromHostname: vi.fn().mockReturnValue(null),
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
  getPublicSettingSync: vi.fn().mockReturnValue(false),
  getUntypedSetting: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}));

describe("GraphQL Whitebox Native Security Rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

describe("GraphQL dispatcher auth gate (catch-all /api/graphql)", () => {
  it("rejects unauthenticated GraphQL POST with 401", async () => {
    const res = await invokeGraphql(
      "{ __typename }",
      {},
      { user: null, tenantId: "t1", bypass: false },
    );
    expect(res.status).toBe(401);
  });

  it("does not return 401 for authenticated admin (may 200/4xx/5xx deeper)", async () => {
    const admin = createMockUser({ _id: "u1", role: "admin", isAdmin: true } as any);
    const res = await invokeGraphql(
      "{ __typename }",
      {},
      {
        user: admin,
        tenantId: "t1",
        roles: [{ _id: "admin", name: "Administrator", isAdmin: true, permissions: ["*"] }],
        bypass: true,
      },
    );
    expect(res.status).not.toBe(401);
  });
});
