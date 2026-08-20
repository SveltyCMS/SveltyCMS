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
  getDb: vi.fn().mockReturnValue({
    crud: {},
    auth: {},
    media: {},
    system: {},
    collection: {},
    isConnected: () => true,
  }),
  isDbConnected: vi.fn().mockReturnValue(true),
  getAuth: vi.fn().mockReturnValue({}),
}));

vi.mock("@utils/tenant", () => ({
  isMultiTenantEnabled: vi.fn().mockReturnValue(false),
  getTenantIdFromHostname: vi.fn().mockReturnValue(null),
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

/**
 * Defense-in-depth mirrors the Subscription.subscribe guards in
 * src/routes/api/graphql/+server.ts (contentStructureUpdated, entryUpdated, onPing).
 * Pure helper exercises the same contract; source-guard asserts all three resolvers
 * still check context.user (prevents silent regression if a subscribe is re-inlined).
 */
function assertSubscriptionAuth(context: {
  user?: unknown;
  pubSub?: { subscribe: (t: string) => unknown };
}) {
  if (!context.user) {
    const err = new Error("Unauthorized");
    (err as any).status = 401;
    throw err;
  }
  return context.pubSub!.subscribe("entryUpdated");
}

describe("GraphQL subscription subscribe() requires context.user (P1)", () => {
  it("source keeps context.user guards on all three subscription fields", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "src/routes/api/graphql/+server.ts"), "utf8");
    // Three subscribe handlers must each re-assert auth (defense-in-depth)
    const guards = src.match(/if\s*\(\s*!context\.user\s*\)\s*throw\s+new\s+AppError/g) || [];
    expect(guards.length).toBeGreaterThanOrEqual(3);
    expect(src).toContain("contentStructureUpdated");
    expect(src).toContain("entryUpdated");
    expect(src).toContain("onPing");
  });

  it("rejects subscribe when context.user is missing", () => {
    const pubSub = { subscribe: vi.fn(() => "async-iterator") };
    expect(() => assertSubscriptionAuth({ user: null, pubSub })).toThrow(/Unauthorized/i);
    expect(pubSub.subscribe).not.toHaveBeenCalled();
  });

  it("rejects subscribe when context.user is undefined", () => {
    const pubSub = { subscribe: vi.fn(() => "async-iterator") };
    expect(() => assertSubscriptionAuth({ pubSub })).toThrow(/Unauthorized/i);
    expect(pubSub.subscribe).not.toHaveBeenCalled();
  });

  it("allows subscribe when context.user is present", () => {
    const pubSub = { subscribe: vi.fn(() => "async-iterator") };
    const user = createMockUser({ _id: "u1", role: "editor", isAdmin: false } as any);
    const result = assertSubscriptionAuth({ user, pubSub });
    expect(result).toBe("async-iterator");
    expect(pubSub.subscribe).toHaveBeenCalledWith("entryUpdated");
  });
});
