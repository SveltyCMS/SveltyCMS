/**
 * @file tests/unit/api/graphql-apq.test.ts
 * @description Unit tests for GraphQL Automatic Persisted Queries (APQ) protocol and L1/L2 Redis caching.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, GET } from "@src/routes/api/graphql/+server";
import { cacheService } from "@src/databases/cache/cache-service";
import { createMockUser } from "../utils/mock-factories";

const cacheStore = new Map<string, any>();

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    get: vi.fn(
      async (key: string, tenantId?: string) =>
        cacheStore.get(`${tenantId || "default"}:${key}`) ?? null,
    ),
    getSync: vi.fn(
      (key: string, tenantId?: string) => cacheStore.get(`${tenantId || "default"}:${key}`) ?? null,
    ),
    set: vi.fn(async (key: string, val: any, _ttl: number, tenantId?: string) => {
      cacheStore.set(`${tenantId || "default"}:${key}`, val);
    }),
    delete: vi.fn(async (key: string, tenantId?: string) => {
      cacheStore.delete(`${tenantId || "default"}:${key}`);
    }),
    generateKey: vi.fn(
      (key: string, tenantId?: string) => `tenant:${tenantId || "default"}:${key}`,
    ),
  },
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    crud: {},
    auth: {},
    media: {},
    system: {},
    collection: {},
    isConnected: () => true,
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

vi.mock("@src/content/index.server", () => ({
  contentStore: {
    isReloading: false,
    waitForReload: vi.fn().mockResolvedValue(undefined),
    getCollections: vi.fn().mockReturnValue([]),
  },
  contentSystem: {
    getHealthStatus: vi.fn().mockReturnValue({ status: "healthy" }),
  },
}));

describe("GraphQL Automatic Persisted Queries (APQ)", () => {
  const mockUser = createMockUser({ role: "admin", isAdmin: true });
  const testHash = "ecf4edb46db40b5132295c0291d62fb7147bacfb";
  const testQuery = "query TestApq { contentSystemHealth { status } }";

  beforeEach(async () => {
    await cacheService.delete(`apq:${testHash}`, "global");
  });

  it("returns PERSISTED_QUERY_NOT_FOUND when APQ hash is not registered and query is missing", async () => {
    const url = new URL("http://localhost:5173/api/graphql");
    const body = {
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: testHash,
        },
      },
    };

    const event = {
      request: new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      url,
      locals: {
        user: mockUser,
        tenantId: "global",
      },
    } as any;

    const response = await POST(event);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.errors).toBeDefined();
    expect(json.errors[0].extensions.code).toBe("PERSISTED_QUERY_NOT_FOUND");
    expect(json.errors[0].message).toBe("PersistedQueryNotFound");
  });

  it("registers APQ hash when both query and hash are provided in POST", async () => {
    const url = new URL("http://localhost:5173/api/graphql");
    const body = {
      query: testQuery,
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: testHash,
        },
      },
    };

    const event = {
      request: new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      url,
      locals: {
        user: mockUser,
        tenantId: "global",
      },
    } as any;

    const response = await POST(event);
    expect(response.status).toBe(200);

    // Verify registered in cacheService
    const cached = cacheService.getSync<string>(`apq:${testHash}`, "global");
    expect(cached).toBe(testQuery);
  });

  it("resolves and executes registered APQ hash without query string in subsequent requests", async () => {
    // 1. Pre-register query in cacheService
    await cacheService.set(`apq:${testHash}`, testQuery, 3600, "global");

    // 2. Request with hash only
    const url = new URL("http://localhost:5173/api/graphql");
    const body = {
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: testHash,
        },
      },
    };

    const event = {
      request: new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      url,
      locals: {
        user: mockUser,
        tenantId: "global",
      },
    } as any;

    const response = await POST(event);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.errors).toBeUndefined();
    expect(json.data).toBeDefined();
  });

  it("supports GET requests with extensions query parameter", async () => {
    await cacheService.set(`apq:${testHash}`, testQuery, 3600, "global");

    const extensionsStr = JSON.stringify({
      persistedQuery: {
        version: 1,
        sha256Hash: testHash,
      },
    });
    const url = new URL(
      `http://localhost:5173/api/graphql?extensions=${encodeURIComponent(extensionsStr)}`,
    );

    const event = {
      request: new Request(url, { method: "GET" }),
      url,
      locals: {
        user: mockUser,
        tenantId: "global",
      },
    } as any;

    const response = await GET(event);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.errors).toBeUndefined();
    expect(json.data).toBeDefined();
  });
});
