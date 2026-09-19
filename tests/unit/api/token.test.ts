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
      getTokenByValue: vi.fn().mockResolvedValue({ success: true, data: null }),
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

vi.mock("@utils/api-handler", () => ({
  apiHandler: (fn: any) => fn,
}));

import {
  GET as dispatcherGET,
  POST as dispatcherPOST,
  PUT as dispatcherPUT,
  DELETE as dispatcherDELETE,
} from "@src/routes/api/[...path]/+server";
import { isPublicRoute } from "@utils/hook-utils";

function tokenAdapter() {
  const dbStub = createDbAdapterStub();
  return {
    ...dbStub,
    auth: {
      ...dbStub.auth,
      getAllTokens: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getTokenById: vi.fn().mockResolvedValue({ success: true, data: {} }),
      getTokenByValue: vi.fn().mockResolvedValue({ success: true, data: null }),
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

/** Adapter whose token lookup resolves to a real _id so updateToken is reachable. */
function updateableTokenAdapter() {
  const adapter = tokenAdapter();
  adapter.auth.getTokenById = vi.fn().mockImplementation(async (id) => ({
    success: true,
    data: { _id: id, token: `val-${id}` },
  }));
  return adapter;
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

  it("should batch delete tokens via batched deleteTokens call", async () => {
    const adapter = tokenAdapter();
    adapter.auth.deleteTokens = vi
      .fn()
      .mockResolvedValue({ success: true, data: { deletedCount: 2 } });
    adapter.auth.getTokenByValue = vi.fn().mockResolvedValue({ success: true, data: null });
    adapter.auth.getTokenById = vi.fn().mockImplementation(async (id) => ({
      success: true,
      data: { _id: id, token: `val-${id}` },
    }));

    const event = createMockRequestEvent({
      method: "POST",
      path: "token/batch",
      body: {
        op: "delete",
        ids: ["t1", "t2"],
      },
      user: { ...admin, role: "admin", isAdmin: true },
      tenantId: "t1",
      roles: [{ _id: "admin", name: "Administrator", isAdmin: true, permissions: [] }],
      dbAdapter: adapter,
    });
    const response = await dispatcherPOST(event);
    const result = await response!.json();
    expect(result.success).toBe(true);
    expect(result.data.deletedCount).toBe(2);
    expect(adapter.auth.deleteTokens).toHaveBeenCalledTimes(1);
    expect(adapter.auth.deleteTokens).toHaveBeenCalledWith(["t1", "t2"], { tenantId: "t1" });
  });

  it("should reject batch operations exceeding maximum batch size", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `token-${i}`);
    const event = createMockRequestEvent({
      method: "POST",
      path: "token/batch",
      body: {
        op: "delete",
        ids,
      },
      user: { ...admin, role: "admin", isAdmin: true },
      tenantId: "t1",
      roles: [{ _id: "admin", name: "Administrator", isAdmin: true, permissions: [] }],
      dbAdapter: tokenAdapter(),
    });
    await expect(dispatcherPOST(event)).rejects.toThrow("maximum limit of 100");
  });

  it("should rate limit password reset token creation per client IP and ignore spoofed headers", async () => {
    const { cacheService } = await import("@src/databases/cache/cache-service");
    const map = new Map<string, string>();
    (cacheService.get as any).mockImplementation(async (key: string) => map.get(key) || null);
    (cacheService.set as any).mockImplementation(async (key: string, val: string) => {
      map.set(key, val);
    });

    const createResetEvent = (spoofedIp: string) =>
      createMockRequestEvent({
        method: "POST",
        path: "token/create-token",
        headers: {
          "x-forwarded-for": spoofedIp,
        },
        body: {
          type: "reset",
          email: "user@example.com",
        },
        user: { ...admin, role: "admin", isAdmin: true },
        tenantId: "t1",
        roles: [{ _id: "admin", name: "Administrator", isAdmin: true, permissions: [] }],
        dbAdapter: tokenAdapter(),
      });

    const res1 = await dispatcherPOST(createResetEvent("1.1.1.1"));
    expect(res1.status).toBe(200);

    await expect(dispatcherPOST(createResetEvent("2.2.2.2"))).rejects.toThrow(
      "Password reset already requested",
    );
  });

  describe("Authorization and update allowlist (authz bypass regression)", () => {
    const editor = { _id: "u-editor", email: "editor@example.com", role: "editor" };
    const editorRoles = [{ _id: "editor", name: "Editor", isAdmin: false, permissions: [] }];

    it("keeps only the explicit validate-token path public", () => {
      // The old deny-list treated every /api/token/* path (other than
      // list/batch/create-token/resolve) as public, so PUT/DELETE on
      // /api/token/:id skipped both the middleware gate and the dispatcher's
      // endpoint-permission map (`api:token` => admin) — any session could
      // mutate tokens (CWE-862 authorization bypass).
      expect(isPublicRoute("/api/token/some-token-id")).toBe(false);
      expect(isPublicRoute("/api/token/list")).toBe(false);
      expect(isPublicRoute("/api/token/batch")).toBe(false);
      expect(isPublicRoute("/api/token/create-token")).toBe(false);
      expect(isPublicRoute("/api/token/validate-token/some-token-value")).toBe(true);
    });

    it("denies token update and delete for a non-admin session", async () => {
      const adapter = updateableTokenAdapter();

      const putEvent = createMockRequestEvent({
        method: "PUT",
        path: "token/token-id",
        body: { newTokenData: { expires: "2026-02-01T00:00:00.000Z" } },
        user: editor,
        tenantId: "t1",
        roles: editorRoles,
        dbAdapter: adapter,
      });
      await expect(dispatcherPUT(putEvent)).rejects.toThrow(/Forbidden/);

      const deleteEvent = createMockRequestEvent({
        method: "DELETE",
        path: "token/token-id",
        user: editor,
        tenantId: "t1",
        roles: editorRoles,
        dbAdapter: adapter,
      });
      await expect(dispatcherDELETE(deleteEvent)).rejects.toThrow(/Forbidden/);

      expect(adapter.auth.updateToken).not.toHaveBeenCalled();
      expect(adapter.auth.deleteTokens).not.toHaveBeenCalled();
    });

    it("denies token update without any session", async () => {
      const putEvent = createMockRequestEvent({
        method: "PUT",
        path: "token/token-id",
        body: { newTokenData: { expires: "2026-02-01T00:00:00.000Z" } },
        user: null,
        tenantId: "t1",
        roles: [],
        dbAdapter: updateableTokenAdapter(),
      });
      await expect(dispatcherPUT(putEvent)).rejects.toThrow(/Authentication required/);
    });

    it("allows an admin update and strips non-writable columns", async () => {
      const adapter = updateableTokenAdapter();
      const event = createMockRequestEvent({
        method: "PUT",
        path: "token/token-id",
        body: {
          newTokenData: {
            user_id: "victim-user-id",
            type: "reset",
            token: "attacker-chosen-token",
            _id: "another-token-id",
            tenantId: "tenant-evil",
            email: "victim@example.com",
            role: "developer",
            expires: "2026-02-01T00:00:00.000Z",
          },
        },
        user: { ...admin, role: "admin", isAdmin: true },
        tenantId: "t1",
        roles: [{ _id: "admin", name: "Administrator", isAdmin: true, permissions: [] }],
        dbAdapter: adapter,
      });

      const response = await dispatcherPUT(event);
      expect(response!.status).toBe(200);

      expect(adapter.auth.updateToken).toHaveBeenCalledTimes(1);
      const [calledTokenId, payload] = adapter.auth.updateToken.mock.calls[0];
      expect(calledTokenId).toBe("token-id");
      expect(payload).toEqual({
        expires: "2026-02-01T00:00:00.000Z",
        email: "victim@example.com",
        role: "developer",
      });
      for (const forbidden of ["user_id", "type", "token", "_id", "tenantId"]) {
        expect(payload).not.toHaveProperty(forbidden);
      }
    });

    it("allows a role holding the mapped api:token permission, without admin-only fields", async () => {
      const adapter = updateableTokenAdapter();
      const event = createMockRequestEvent({
        method: "PUT",
        path: "token/token-id",
        body: {
          newTokenData: {
            user_id: "victim-user-id",
            email: "victim@example.com",
            role: "developer",
            expires: "2026-03-01T00:00:00.000Z",
          },
        },
        user: { _id: "u-token-mgr", email: "tokens@example.com", role: "token-manager" },
        tenantId: "t1",
        roles: [
          {
            _id: "token-manager",
            name: "Token Manager",
            isAdmin: false,
            permissions: ["api:token"],
          },
        ],
        dbAdapter: adapter,
      });

      const response = await dispatcherPUT(event);
      expect(response!.status).toBe(200);
      // Identity fields stay admin-only: email/role must not be written by the
      // mapped-permission holder; user_id is never client-writable.
      expect(adapter.auth.updateToken.mock.calls[0][1]).toEqual({
        expires: "2026-03-01T00:00:00.000Z",
      });
    });
  });
});
