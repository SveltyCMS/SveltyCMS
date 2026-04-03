/**
 * @file tests/unit/api/token.test.ts
 * @description Unit tests for registration tokens.
 */

import { describe, it, expect, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

// Mock dependencies

// Mock dependencies
// Mock dependencies
vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    auth: {
      getAllTokens: vi.fn(),
      getTokenById: vi.fn(),
      updateToken: vi.fn(),
      createToken: vi.fn(),
      deleteTokens: vi.fn(),
    },
  },
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  getAuth: vi.fn(),
}));

vi.mock("@src/services/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
  getPublicSettingSync: vi.fn().mockReturnValue(true),
}));

vi.mock("@utils/api-handler", () => ({
  apiHandler: (fn: any) => fn,
}));

// Import raw dispatcher handler
import { _handler as dispatcher } from "@src/routes/api/[...path]/+server";

describe("Token API Unit Tests", () => {
  const createMockEvent = (
    method: string,
    path: string,
    body: any = {},
    user: any = { _id: "u1", role: "admin" },
    tenantId?: string,
  ) => {
    return {
      url: new URL(`http://localhost/api/${path}`),
      params: { path },
      request: {
        method,
        json: vi.fn().mockResolvedValue(body),
        headers: new Map(),
      },
      locals: {
        user: { ...user, role: "admin-role" },
        tenantId: tenantId ?? "t1",
        roles: [{ _id: "admin-role", name: "Administrator", isAdmin: true, permissions: [] }],
        dbAdapter: {
          auth: {
            getAllTokens: vi.fn().mockResolvedValue({ success: true, data: [] }),
            getTokenById: vi.fn().mockResolvedValue({ success: true, data: {} }),
            updateToken: vi.fn().mockResolvedValue({ success: true }),
            createToken: vi.fn().mockResolvedValue({ success: true, data: { _id: "new-token" } }),
            deleteTokens: vi.fn().mockResolvedValue({ success: true }),
          },
          collections: {},
          media: {},
          widgets: {},
          system: {},
          crud: {},
        },
      },
      cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    } as unknown as RequestEvent;
  };

  it("should list tokens", async () => {
    const event = createMockEvent("GET", "token");
    const response = await dispatcher(event);
    const result = await response.json();
    expect(result.success).toBe(true);
  });

  it("should create token", async () => {
    const event = createMockEvent("POST", "token/create-token", {
      email: "t@t.com",
      expires: "2026-01-01",
      role: "admin",
    });
    const response = await dispatcher(event);
    const result = await response.json();
    expect(result.success).toBe(true);
  });
});
