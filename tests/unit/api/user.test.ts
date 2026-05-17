/**
 * @file tests/unit/api/user.test.ts
 * @description Unit tests for user management endpoints.
 */

import { describe, it, expect, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { createMockUser, createDbAdapterStub } from "../utils/mock-factories";

// Mock dependencies
vi.mock("@src/databases/db", () => {
  const dbAdapter = createDbAdapterStub();
  return {
    dbAdapter,
    getDbInitPromise: vi.fn().mockResolvedValue(undefined),
    getDb: vi.fn().mockReturnValue(dbAdapter),
    isDbConnected: vi.fn().mockReturnValue(true),
    getAuth: vi.fn().mockReturnValue(dbAdapter.auth),
  };
});

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
  getPublicSettingSync: vi.fn().mockReturnValue(true),
}));

vi.mock("@utils/api-handler", () => ({
  apiHandler: (fn: any) => fn,
}));

// Import raw dispatcher handler
import {
  GET as dispatcherGET,
  POST as dispatcherPOST,
  PATCH as dispatcherPATCH,
  DELETE as dispatcherDELETE,
} from "@src/routes/api/[...path]/+server";

describe("User API Unit Tests", () => {
  const createMockEvent = (
    method: string,
    path: string,
    body: any = {},
    user: any = createMockUser({ _id: "u1", role: "admin" }),
    tenantId?: string,
  ) => {
    return {
      url: new URL(`http://localhost/api/${path}`),
      params: { path },
      request: {
        method,
        json: async () => body,
        formData: vi.fn(),
        headers: new Map(),
      },
      locals: {
        __testBypass: true,
        user: { ...user, isAdmin: true },
        tenantId: tenantId ?? "t1",
        roles: [
          {
            _id: "admin",
            name: "Administrator",
            isAdmin: true,
            permissions: ["user:read", "user:update", "api:user"],
          },
        ],
        dbAdapter: createDbAdapterStub(),
      },
      cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    } as unknown as RequestEvent;
  };

  const callDispatcher = async (event: RequestEvent) => {
    const method = event.request.method;
    if (method === "GET") return dispatcherGET(event);
    if (method === "POST") return dispatcherPOST(event);
    if (method === "PATCH") return dispatcherPATCH(event);
    if (method === "DELETE") return dispatcherDELETE(event);
    return dispatcherGET(event);
  };

  it("should list users", async () => {
    const event = createMockEvent("GET", "user");
    const response = await callDispatcher(event);
    const result = await response!.json();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("should update user attributes", async () => {
    const event = createMockEvent("PATCH", "user/update-user-attributes", {
      user_id: "u1",
      newUserData: { name: "New" },
    });
    const response = await dispatcherPATCH(event);
    const result = await response!.json();
    expect(result.success).toBe(true);
  });
});
