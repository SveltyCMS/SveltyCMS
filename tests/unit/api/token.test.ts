/**
 * @file tests/unit/api/token.test.ts
 * @description Unit tests for registration tokens via shared createMockRequestEvent.
 */

import { describe, it, expect, vi } from "vitest";
import { createMockSuperAdmin, createDbAdapterStub } from "../utils/mock-factories";
import { createMockRequestEvent } from "../utils/mock-event";

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

function tokenAdapter() {
  const dbStub = createDbAdapterStub();
  return {
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
    crud: {
      ...dbStub.crud,
      findMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
      insert: vi.fn().mockResolvedValue({ success: true, data: { _id: "new-token" } }),
      count: vi.fn().mockResolvedValue({ success: true, data: 0 }),
    },
  };
}

describe("Token API Unit Tests", () => {
  const admin = createMockSuperAdmin({ _id: "u1" });

  it("should list tokens", async () => {
    const event = createMockRequestEvent({
      method: "GET",
      path: "token",
      user: { ...admin, role: "admin", isAdmin: true },
      tenantId: "t1",
      roles: [{ _id: "admin", name: "Administrator", isAdmin: true, permissions: [] }],
      dbAdapter: tokenAdapter(),
    });
    const response = await dispatcherGET(event);
    const result = await response!.json();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("should create token", async () => {
    const event = createMockRequestEvent({
      method: "POST",
      path: "token/create-token",
      body: {
        email: "t@t.com",
        expires: "2026-01-01",
        role: "admin",
      },
      user: { ...admin, role: "admin", isAdmin: true },
      tenantId: "t1",
      roles: [{ _id: "admin", name: "Administrator", isAdmin: true, permissions: [] }],
      dbAdapter: tokenAdapter(),
    });
    const response = await dispatcherPOST(event);
    const result = await response!.json();
    expect(result.success).toBe(true);
    expect(result.token).toBeDefined();
    expect(result.token.value).toMatch(/^[a-f0-9]{64}$/);
  });
});
