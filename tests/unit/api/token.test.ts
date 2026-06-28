/**
 * @file tests/unit/api/token.test.ts
 * @description Unit tests for registration tokens.
 */

import { describe, it, expect, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { createMockSuperAdmin, createDbAdapterStub } from "../utils/mock-factories";

// Mock dependencies

// Mock dependencies
// Mock dependencies
vi.mock("@src/databases/db", () => {
  const dbStub = createDbAdapterStub();
  const adapter = {
    ...dbStub,
    auth: {
      ...dbStub.auth,
      getAllTokens: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getTokenById: vi.fn().mockResolvedValue({ success: true, data: {} }),
      updateToken: vi.fn().mockResolvedValue({ success: true, data: { _id: "token-id" } }),
      createToken: vi.fn().mockResolvedValue({ success: true, data: "a".repeat(64) }),
      deleteTokens: vi.fn().mockResolvedValue({ success: true, data: { deletedCount: 1 } }),
    },
    collection: {
      ...dbStub.collection,
      getModel: vi.fn().mockResolvedValue({}),
    },
    crud: {
      ...dbStub.crud,
      findMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
      insert: vi.fn().mockResolvedValue({ success: true, data: { _id: "new-token" } }),
      update: vi.fn().mockResolvedValue({ success: true }),
      delete: vi.fn().mockResolvedValue({ success: true }),
      count: vi.fn().mockResolvedValue({ success: true, data: 0 }),
      findOne: vi.fn().mockResolvedValue({ success: true, data: { _id: "t1" } }),
    },
  };
  return {
    dbAdapter: adapter,
    getDb: vi.fn().mockReturnValue(adapter),
    isDbConnected: vi.fn().mockReturnValue(true),
    getDbInitPromise: vi.fn().mockResolvedValue(undefined),
    getAuth: vi.fn(),
  };
});

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
  getPublicSettingSync: vi.fn().mockReturnValue(true),
}));

vi.mock("@utils/api-handler", () => ({
  apiHandler: (fn: any) => fn,
}));

import { GET as dispatcherGET, POST as dispatcherPOST } from "@src/routes/api/[...path]/+server";

describe("Token API Unit Tests", () => {
  const createMockEvent = (
    method: string,
    path: string,
    body: any = {},
    user: any = createMockSuperAdmin({ _id: "u1" }),
    tenantId?: string,
  ) => {
    const dbStub = createDbAdapterStub();
    return {
      url: new URL(`http://localhost/api/${path}`),
      params: { path },
      request: {
        method,
        json: vi.fn().mockResolvedValue(body),
        headers: new Map(),
      },
      locals: {
        __testBypass: true,
        user: { ...user, role: "admin", isAdmin: true },
        tenantId: tenantId ?? "t1",
        roles: [
          {
            _id: "admin",
            name: "Administrator",
            isAdmin: true,
            permissions: [],
          },
        ],
        dbAdapter: {
          ...dbStub,
          auth: {
            ...dbStub.auth,
            getAllTokens: vi.fn().mockResolvedValue({ success: true, data: [] }),
            getTokenById: vi.fn().mockResolvedValue({ success: true, data: {} }),
            updateToken: vi.fn().mockResolvedValue({ success: true, data: { _id: "token-id" } }),
            createToken: vi.fn().mockResolvedValue({ success: true, data: "a".repeat(64) }),
            deleteTokens: vi.fn().mockResolvedValue({ success: true, data: { deletedCount: 1 } }),
            getUserByEmail: vi.fn().mockResolvedValue({ success: true, data: null }),
          },
          collection: {
            ...dbStub.collection,
            getModel: vi.fn().mockResolvedValue({}),
          },
          collections: {},
          media: {},
          widgets: {},
          system: {},
          crud: {
            ...dbStub.crud,
            findMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
            insert: vi.fn().mockResolvedValue({ success: true, data: { _id: "new-token" } }),
            count: vi.fn().mockResolvedValue({ success: true, data: 0 }),
          },
        },
      },
      cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    } as unknown as RequestEvent;
  };

  it("should list tokens", async () => {
    const event = createMockEvent("GET", "token");
    const response = await dispatcherGET(event as any);
    const result = await response!.json();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("should create token", async () => {
    const event = createMockEvent("POST", "token/create-token", {
      email: "t@t.com",
      expires: "2026-01-01",
      role: "admin",
    });
    const response = await dispatcherPOST(event as any);
    const result = await response!.json();
    expect(result.success).toBe(true);
    expect(result.token).toBeDefined();
    expect(result.token.value).toMatch(/^[a-f0-9]{64}$/);
  });
});
