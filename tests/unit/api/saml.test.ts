/**
 * @file tests/unit/api/saml.test.ts
 * @description Unit tests for SAML authentication endpoints.
 */

import { describe, it, expect, vi } from "vitest";
import { createMockRequestEvent } from "../utils/mock-event";

// Mock dependencies
vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    auth: { getUserById: vi.fn() },
  },
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  getAuth: vi.fn(),
}));

vi.mock("@src/databases/auth/saml-auth", () => ({
  samlAuth: {
    getConfig: vi.fn(),
    initializeLogin: vi.fn(),
  },
  getJackson: vi.fn().mockResolvedValue({}),
  generateSAMLAuthUrl: vi.fn().mockResolvedValue("http://idp.com/auth"),
}));

vi.mock("@src/services/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
  getPublicSettingSync: vi.fn().mockReturnValue(undefined),
}));

vi.mock("@utils/api-handler", () => ({
  apiHandler: (fn: any) => fn,
}));

// Import raw dispatcher handler
import { _handler as dispatcher } from "@src/routes/api/[...path]/+server";

describe("SAML API Unit Tests", () => {
  const createMockEvent = (
    method: string,
    path: string,
    body: any = {},
    user: any = null,
    tenantId?: string,
  ) => {
    return createMockRequestEvent({
      method,
      url: `http://localhost/api/${path}`,
      body,
      user,
      tenantId,
      dbAdapter: {
        auth: { getUserById: vi.fn() },
      },
      roles: user ? [] : [{ _id: "admin-role", name: "Admin", isAdmin: true, permissions: [] }],
    });
  };

  it("should return SAML config", async () => {
    const event = createMockEvent("GET", "auth/saml/config", {}, null, "t1");
    const response = await dispatcher(event);
    const result = await response.json();
    expect(result.success).toBe(true);
  });

  it("should initialize SAML login", async () => {
    const event = createMockEvent(
      "POST",
      "auth/saml/login",
      { email: "test@example.com" },
      null,
      "t1",
    );
    const response = await dispatcher(event);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.url).toBeDefined();
  });
});
