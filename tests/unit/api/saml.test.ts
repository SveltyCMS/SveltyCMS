/**
 * @file tests/unit/api/saml.test.ts
 * @description Unit tests for SAML authentication endpoints.
 */

import { describe, it, expect, vi } from "vitest";

import { beforeAll } from "vitest";
let dispatcherGET: any, dispatcherPOST: any;
beforeAll(async () => {
  const mod = await import("../../../src/routes/api/[...path]/+server");
  dispatcherGET = mod.GET;
  dispatcherPOST = mod.POST;
});
import { createMockRequestEvent } from "../utils/mock-event";

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
          collection: { getModel: vi.fn().mockResolvedValue({}) },
        },
        roles: user ? [] : [{ _id: "admin", name: "Admin", isAdmin: true, permissions: [] }],
      }),
      params: { path },
    };
  };

  it("should return SAML config", async () => {
    const admin = { _id: "admin1", role: "admin", isAdmin: true };
    const event = createMockEvent("GET", "auth/saml/config", {}, admin, "t1");
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
