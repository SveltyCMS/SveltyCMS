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
    getConfig: vi.fn().mockResolvedValue({ success: true, config: {} }),
    initializeLogin: vi.fn().mockResolvedValue({ success: true, url: "http://idp.com/auth" }),
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

// Import dispatcher (handler)
import { GET as dispatcherGET, POST as dispatcherPOST } from "@src/routes/api/[...path]/+server";

describe("SAML API Unit Tests", () => {
  const createMockEvent = (
    method: string,
    path: string,
    body: any = {},
    user: any = null,
    tenantId?: string,
  ) => {
    return {
      ...createMockRequestEvent({
        method,
        url: `http://localhost/api/${path}`,
        body,
        user,
        tenantId,
        dbAdapter: {
          auth: { getUserById: vi.fn() },
        },
        roles: user ? [] : [{ _id: "admin", name: "Admin", isAdmin: true, permissions: [] }],
      }),
      params: { path },
    };
  };

  it("should return SAML config", async () => {
    const event = createMockEvent("GET", "auth/saml/config", {}, null, "t1");
    (event as any).request = { method: "GET", headers: new Headers() };
    (event as any).cookies = { get: vi.fn() };

    const response = await dispatcherGET(event as any);
    const result = await response!.json();
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
    (event as any).request = {
      method: "POST",
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({ email: "test@example.com" }),
    };
    (event as any).cookies = { get: vi.fn() };

    const response = await dispatcherPOST(event as any);
    const result = await response!.json();
    expect(result.success).toBe(true);
    expect(result.data.url).toBeDefined();
  });
});
