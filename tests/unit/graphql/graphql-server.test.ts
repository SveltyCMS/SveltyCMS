/**
 * @file tests/unit/graphql/graphql-server.test.ts
 * @description Unit tests for the GraphQL endpoint module (+server.ts).
 *
 * Covers schema caching & tenant resolution, security validation rules,
 * and resolver context construction. Real `graphql-yoga` / `graphql` /
 * `./rules` are exercised; only boundaries (content system, response cache,
 * pub-sub, resolvers, DB adapter) are mocked.
 *
 * ### Features:
 * - adapter unscoping → stable schema cache keys across per-request wrappers
 * - tenant isolation + LRU eviction (MAX_TENANT_SCHEMA_CACHE = 32)
 * - promise purge on schema build failure (self-healing)
 * - parse-time query cost, depth (8), alias (15), introspection rules
 * - pubSub + loaders injected into resolver context
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks (vi.mock factories are invoked before module body execution)
// ---------------------------------------------------------------------------
const {
  mockContentSystem,
  mockAnalyzeQueryCost,
  mockResponseCache,
  mockPubSub,
  registerCollections,
  collectionsResolvers,
  capturedContexts,
} = vi.hoisted(() => {
  const capturedContexts: any[] = [];

  const mockContentSystem = {
    version: 1,
    waitForReload: vi.fn().mockResolvedValue(undefined),
  };

  const mockAnalyzeQueryCost = vi.fn().mockReturnValue({ allowed: true, cost: 50 });

  const mockResponseCache = {
    get: vi.fn(),
    set: vi.fn(),
  };

  const mockPubSub = {
    subscribe: vi.fn(),
    publish: vi.fn(),
  };

  const registerCollections = vi.fn().mockResolvedValue({
    typeDefs: "type Collection { id: ID! }",
    queryFields: ["collections: [Collection]"],
  });

  const collectionsResolvers = vi.fn().mockResolvedValue({
    Query: {
      collections: (_: unknown, __: unknown, ctx: any) => {
        capturedContexts.push(ctx);
        return [{ id: "c1" }];
      },
    },
    Mutation: {},
  });

  return {
    mockContentSystem,
    mockAnalyzeQueryCost,
    mockResponseCache,
    mockPubSub,
    registerCollections,
    collectionsResolvers,
    capturedContexts,
  };
});

// ---------------------------------------------------------------------------
// Module Mocks (boundaries only — DB, services, content system)
// ---------------------------------------------------------------------------
vi.mock("@src/content/index.server", () => ({
  contentSystem: mockContentSystem,
}));

vi.mock("@src/routes/api/graphql/cost-analyzer", () => ({
  analyzeQueryCost: mockAnalyzeQueryCost,
  formatCostError: (cost: number, limit: number) => `Query cost ${cost} exceeds limit ${limit}`,
}));

vi.mock("@src/services/cache/response-cache", () => ({
  responseCache: mockResponseCache,
  buildGraphQLResponseCacheKey: vi.fn(
    (q: string, v: unknown, f: string, u: unknown) => `cache:${q}:${JSON.stringify(v)}:${f}:${u}`,
  ),
  generateContentEtag: vi.fn(() => '"mock-etag"'),
}));

vi.mock("@src/services/background/pub-sub", () => ({
  pubSub: mockPubSub,
}));

vi.mock("@src/services/sdk", () => ({
  LocalCMS: vi.fn().mockImplementation((db: any) => ({ db })),
}));

vi.mock("@src/routes/api/graphql/resolvers/collections", () => ({
  registerCollections,
  collectionsResolvers,
}));

vi.mock("@src/routes/api/graphql/resolvers/media", () => ({
  mediaTypeDefs: () => `
    type MediaImage { id: ID! }
    type MediaDocument { id: ID! }
    type MediaAudio { id: ID! }
    type MediaVideo { id: ID! }
    type MediaRemote { id: ID! }
    type MediaFolder { id: ID! }
  `,
  mediaResolvers: () => ({}),
}));

vi.mock("@src/routes/api/graphql/resolvers/system", () => ({
  systemTypeDefs: "type SystemStatus { ok: Boolean }",
  systemResolvers: { Query: {} },
}));

vi.mock("@src/routes/api/graphql/resolvers/users", () => ({
  userTypeDefs: () => "type User { id: ID! me: User }",
  userResolvers: () => ({}),
}));

vi.mock("@src/routes/api/graphql/resolvers/seo", () => ({
  seoTypeDefs: "type SEO { title: String }",
  seoResolvers: { Query: {} },
}));

vi.mock("@src/routes/api/graphql/resolvers/virtual-collections", () => ({
  virtualCollectionsTypeDefs: "",
  virtualCollectionsQueryFields: "",
  virtualCollectionsMutationFields: "",
  virtualCollectionsResolvers: () => ({}),
  virtualCollectionsMutationResolvers: () => ({}),
}));

vi.mock("@src/routes/api/graphql/resolvers/data-operations", () => ({
  dataOperationsTypeDefs: "scalar JSON",
  dataOperationsQueryFields: "",
  dataOperationsMutationFields: "",
  dataOperationsQueryResolvers: () => ({}),
  dataOperationsMutationResolvers: () => ({}),
  JSONScalar: {},
}));

vi.mock("@src/routes/api/graphql/loaders", () => ({
  createLoaders: vi.fn().mockReturnValue({}),
}));

vi.mock("@src/databases/auth/permissions", () => ({
  registerPermission: vi.fn(),
}));

// The nested graphql-jit copy (CJS) compiles schema types from a different
// graphql realm than the vite-processed ESM build — a unit-test artifact, not a
// runtime issue. These tests cover caching/security/context, not JIT execution.
vi.mock("@envelop/graphql-jit", () => ({
  useGraphQlJit: () => ({}),
}));

// ---------------------------------------------------------------------------
// Subject under test (imports real graphql-yoga, graphql, ./rules, error-handling)
// ---------------------------------------------------------------------------
import { _getYogaApp, _refreshSchema } from "@src/routes/api/graphql/+server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createMockDbAdapter(tenantId?: string, rootAdapter?: any) {
  const root = rootAdapter || { id: "root-db-instance" };
  return {
    id: `adapter-${tenantId || "default"}`,
    boundTenantId: tenantId,
    unscoped: () => root,
  };
}

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------
describe("GraphQL Server Endpoint", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContentSystem.version = 1;
    mockAnalyzeQueryCost.mockReturnValue({ allowed: true, cost: 50 });
    capturedContexts.length = 0;
    delete process.env.BLOCK_GRAPHQL_INTROSPECTION;
  });

  afterEach(() => {
    delete process.env.BLOCK_GRAPHQL_INTROSPECTION;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  // =========================================================================
  // 1. Schema Caching & Tenant Resolution
  // =========================================================================
  describe("Schema Caching & Tenant Resolution (_getYogaApp)", () => {
    it("returns the same Yoga instance for repeated calls on the same adapter + tenant", async () => {
      const adapter = createMockDbAdapter("tenant-1");

      // NOTE: _getYogaApp is async, so the two CALLS return distinct wrapper
      // promises — the cached promise is shared underneath. Compare the resolved
      // instances, which is the meaningful identity assertion.
      const app1 = await _getYogaApp(adapter, "tenant-1");
      const app2 = await _getYogaApp(adapter, "tenant-1");

      expect(app1).toBe(app2);
    });

    it("unwraps proxy/scoped adapters to the root instance so per-request wrappers share the cache", async () => {
      const rootDb = { instanceId: "shared-postgres-pool" };

      // Two distinct wrapper objects representing two separate HTTP requests
      const request1Adapter = {
        boundTenantId: "tenant-a",
        unscoped: () => ({ unscoped: () => rootDb }),
      };
      const request2Adapter = {
        boundTenantId: "tenant-a",
        unscoped: () => rootDb,
      };

      const app1 = await _getYogaApp(request1Adapter, "tenant-a");
      const app2 = await _getYogaApp(request2Adapter, "tenant-a");

      expect(app1).toBe(app2);
    });

    it("creates isolated Yoga instances for different tenants on the same root adapter", async () => {
      const rootDb = { instanceId: "shared-postgres-pool" };
      const adapterTenantA = { boundTenantId: "tenant-a", unscoped: () => rootDb };
      const adapterTenantB = { boundTenantId: "tenant-b", unscoped: () => rootDb };

      const appA = await _getYogaApp(adapterTenantA, "tenant-a");
      const appB = await _getYogaApp(adapterTenantB, "tenant-b");

      expect(appA).not.toBe(appB);
    });

    it("invalidates the cache when contentSystem.version changes", async () => {
      const adapter = createMockDbAdapter("tenant-1");

      const appVersion1 = await _getYogaApp(adapter, "tenant-1");

      // Bump content version (e.g. dynamic schema or collection modified)
      mockContentSystem.version = 2;

      const appVersion2 = await _getYogaApp(adapter, "tenant-1");

      expect(appVersion1).not.toBe(appVersion2);
    });

    it("invalidates the schema cache when _refreshSchema is explicitly invoked", async () => {
      const adapter = createMockDbAdapter("tenant-1");

      const initialApp = await _getYogaApp(adapter, "tenant-1");
      const refreshedApp = await _refreshSchema(adapter, "tenant-1");

      expect(initialApp).not.toBe(refreshedApp);
    });

    it("evicts the oldest tenant entry when MAX_TENANT_SCHEMA_CACHE (32) is exceeded", async () => {
      const rootDb = { instanceId: "lru-test-db" };

      // Fill cache to max capacity (32 tenants)
      for (let i = 0; i < 32; i++) {
        const adapter = { boundTenantId: `tenant-${i}`, unscoped: () => rootDb };
        await _getYogaApp(adapter, `tenant-${i}`);
      }

      // tenant-0 is still cached
      const tenant0Adapter = { boundTenantId: "tenant-0", unscoped: () => rootDb };
      const tenant0AppBefore = await _getYogaApp(tenant0Adapter, "tenant-0");

      // 33rd tenant forces eviction of the oldest (tenant-0)
      const adapter33 = { boundTenantId: "tenant-32", unscoped: () => rootDb };
      await _getYogaApp(adapter33, "tenant-32");

      // tenant-0 must be rebuilt as a brand-new instance
      const tenant0AppAfter = await _getYogaApp(tenant0Adapter, "tenant-0");
      expect(tenant0AppBefore).not.toBe(tenant0AppAfter);
    });

    it("purges the rejected promise from the cache so the next attempt rebuilds", async () => {
      registerCollections.mockRejectedValueOnce(new Error("Database connection dropped"));

      const adapter = createMockDbAdapter("failing-tenant");

      await expect(_getYogaApp(adapter, "failing-tenant")).rejects.toThrow(
        "Database connection dropped",
      );

      // Subsequent attempt should retry the build instead of reusing the rejection
      await expect(_getYogaApp(adapter, "failing-tenant")).resolves.toBeDefined();
    });
  });

  // =========================================================================
  // 2. Security Rules & Query Validation
  // =========================================================================
  describe("Security & Validation Rules", () => {
    it("rejects over-budget queries at parse time", async () => {
      mockAnalyzeQueryCost.mockReturnValue({ allowed: false, cost: 1550 });

      const adapter = createMockDbAdapter();
      const yogaApp = await _getYogaApp(adapter, "global");

      const response = await yogaApp.fetch("http://localhost/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ me { id } }" }),
      });

      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.errors).toBeDefined();
      expect(body.errors[0].message).toContain("Query cost 1550 exceeds limit 1000");
    });

    it("blocks schema introspection in production mode", async () => {
      process.env.NODE_ENV = "production";

      const adapter = createMockDbAdapter();
      const yogaApp = await _getYogaApp(adapter, "global");

      const response = await yogaApp.fetch("http://localhost/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query Introspect { __schema { types { name } } }`,
        }),
      });

      const body = await response.json();
      expect(body.errors).toBeDefined();
      expect(body.errors[0].message).toMatch(/GraphQL introspection has been disabled/i);
    });

    it("blocks schema introspection when BLOCK_GRAPHQL_INTROSPECTION is set", async () => {
      process.env.BLOCK_GRAPHQL_INTROSPECTION = "true";

      const adapter = createMockDbAdapter();
      const yogaApp = await _getYogaApp(adapter, "global");

      const response = await yogaApp.fetch("http://localhost/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query Introspect { __schema { queryType { name } } }`,
        }),
      });

      const body = await response.json();
      expect(body.errors).toBeDefined();
      expect(body.errors[0].message).toMatch(/GraphQL introspection has been disabled/i);
    });

    it("enforces the depth limit (max 8)", async () => {
      const adapter = createMockDbAdapter();
      const yogaApp = await _getYogaApp(adapter, "global");

      // 10 nested levels — exceeds the depth limit of 8 (built programmatically
      // to avoid unbalanced-brace mistakes in a literal query string)
      let deepQuery = "query Deep { ";
      for (let i = 0; i < 10; i++) deepQuery += "me { ";
      deepQuery += "id";
      for (let i = 0; i < 10; i++) deepQuery += " }";
      deepQuery += " }";

      const response = await yogaApp.fetch("http://localhost/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: deepQuery }),
      });

      const body = await response.json();
      expect(body.errors).toBeDefined();
      expect(body.errors.some((e: any) => /exceeds maximum allowed depth/i.test(e.message))).toBe(
        true,
      );
    });

    it("enforces the alias count limit (max 15)", async () => {
      const adapter = createMockDbAdapter();
      const yogaApp = await _getYogaApp(adapter, "global");

      // 16 aliases in a single query
      const aliases = Array.from({ length: 16 }, (_, i) => `a${i}: me { id }`).join("\n");
      const aliasedQuery = `query { ${aliases} }`;

      const response = await yogaApp.fetch("http://localhost/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: aliasedQuery }),
      });

      const body = await response.json();
      expect(body.errors).toBeDefined();
      expect(body.errors[0].message).toMatch(/too many aliases/i);
    });
  });

  // =========================================================================
  // 3. Execution & Context Construction
  // =========================================================================
  describe("Context Construction & Execution", () => {
    it("passes user, tenantId, dbAdapter, cms, pubSub, loaders and publicationFilter into resolver context", async () => {
      const adapter = createMockDbAdapter("tenant-99");
      const yogaApp = await _getYogaApp(adapter, "tenant-99");

      const response = await yogaApp.fetch(
        "http://localhost/api/graphql",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "{ collections { id } }" }),
        },
        {
          user: { _id: "usr_123", email: "u@test.dev" },
          tenantId: "tenant-99",
          dbAdapter: adapter,
          cms: { db: adapter },
          loaders: { fakeLoader: true },
          publicationFilter: "published",
        } as any,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.collections).toEqual([{ id: "c1" }]);

      const ctx = capturedContexts.at(-1);
      expect(ctx).toBeDefined();
      expect(ctx.user._id).toBe("usr_123");
      expect(ctx.tenantId).toBe("tenant-99");
      expect(ctx.dbAdapter).toBe(adapter);
      expect(ctx.cms).toEqual({ db: adapter });
      expect(ctx.pubSub).toBe(mockPubSub);
      expect(ctx.publicationFilter).toBe("published");
      expect(ctx.loaders).toEqual({ fakeLoader: true });
    });

    it("returns a GraphQL error envelope for unknown fields", async () => {
      const adapter = createMockDbAdapter();
      const yogaApp = await _getYogaApp(adapter, "global");

      const response = await yogaApp.fetch("http://localhost/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ doesNotExist { id } }" }),
      });

      const body = await response.json();
      expect(body.errors).toBeDefined();
      expect(body.errors[0].message).toMatch(/Cannot query field/i);
    });
  });
});
