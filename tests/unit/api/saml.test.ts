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
import { createMockSuperAdmin, createDbAdapterStub } from "../utils/mock-factories";

describe("SAML API Unit Tests", () => {
  const createMockEvent = (
    method: string,
    path: string,
    body: any = {},
    user: any = null,
    tenantId?: string,
  ) => {
    const dbStub = createDbAdapterStub();
    dbStub.auth.getUserById = vi.fn();
    dbStub.collection.getModel = vi.fn().mockResolvedValue({});

    return {
      ...createMockRequestEvent({
        method,
        url: `http://localhost/api/${path}`,
        body,
        user,
        tenantId,
        dbAdapter: dbStub,
        roles: user ? [] : [{ _id: "admin", name: "Admin", isAdmin: true, permissions: [] }],
      }),
      params: { path },
    };
  };

  it("should return SAML config", async () => {
    const admin = createMockSuperAdmin({ _id: "admin1" });
    const event = createMockEvent("GET", "auth/saml/config", {}, admin, "t1");
    (event as any).request = { method: "GET", headers: new Headers() };
    (event as any).cookies = { get: vi.fn(), set: vi.fn() };

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
    (event as any).cookies = { get: vi.fn(), set: vi.fn() };

    const response = await dispatcherPOST(event as any);
    const result = await response!.json();
    expect(result.success).toBe(true);
    expect(result.data.url).toBeDefined();
  });

  it("should process SAML ACS callback successfully when state matches", async () => {
    const event = createMockEvent("POST", "auth/saml/acs");
    const formData = new Map<string, string>();
    formData.set("SAMLResponse", "mock-saml-response-xml");
    formData.set("RelayState", "valid-state-token");

    (event as any).request = {
      method: "POST",
      headers: new Headers([["content-type", "application/x-www-form-urlencoded"]]),
      formData: vi.fn().mockResolvedValue(formData),
    };
    (event as any).cookies = {
      get: vi.fn((name) => {
        if (name === "saml_state") return "valid-state-token";
        if (name === "saml_csrf") return "mock-csrf-token";
        return null;
      }),
      delete: vi.fn(),
    };

    // Mock parseSAMLResponse behavior
    const jacksonModule = await import("@src/databases/auth/saml-auth");
    const jacksonApi = await jacksonModule.getJackson();
    jacksonApi.saml = {
      parseSAMLResponse: vi.fn().mockResolvedValue({
        profile: {
          email: "user@test.com",
          firstName: "Test",
          lastName: "User",
        },
      }),
    };

    // Mock DB operations using the global mock adapter
    const db = (globalThis as any).mockDbAdapter;
    db.auth.getUserByEmail.mockResolvedValue({
      success: true,
      data: { _id: "user123", email: "user@test.com" },
    });
    db.auth.createSession.mockResolvedValue({
      success: true,
      data: { _id: "session123" },
    });

    const response = await dispatcherPOST(event as any);
    const result = await response!.json();
    expect(result.success).toBe(true);
    expect(event.cookies.delete).toHaveBeenCalledWith("saml_state", {
      path: "/",
    });
  });

  it("should block SAML ACS callback with 403 when state mismatched (CSRF Protection)", async () => {
    const event = createMockEvent("POST", "auth/saml/acs");
    const formData = new Map<string, string>();
    formData.set("SAMLResponse", "mock-saml-response-xml");
    formData.set("RelayState", "attacker-state");

    (event as any).request = {
      method: "POST",
      headers: new Headers([["content-type", "application/x-www-form-urlencoded"]]),
      formData: vi.fn().mockResolvedValue(formData),
    };
    (event as any).cookies = {
      get: vi.fn((name) => {
        if (name === "saml_state") return "victim-state";
        if (name === "saml_csrf") return "mock-csrf-token";
        return null;
      }),
      delete: vi.fn(),
    };

    const response = await dispatcherPOST(event as any);
    const result = await response!.json();
    expect(response!.status).toBe(403);
    expect(result.success).toBe(false);
    expect(result.message).toContain("CSRF State mismatch");
  });
});
