/**
 * @file tests/unit/api/saml.test.ts
 * @description Unit tests for SAML authentication endpoints.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@node-saml/node-saml", () => ({
  SAML: vi.fn(function (this: any) {
    this.getAuthorizeUrlAsync = vi
      .fn()
      .mockResolvedValue("https://idp.example.com/sso?SAMLRequest=...");
    this.validatePostResponseAsync = vi.fn().mockResolvedValue({
      profile: {
        nameID: "user@test.com",
        attributes: {
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": "user@test.com",
        },
      },
    });
  }),
}));

import { beforeAll } from "vitest";
let dispatcherGET: any, dispatcherPOST: any;
beforeAll(async () => {
  const mod = await import("../../../src/routes/api/[...path]/+server");
  dispatcherGET = mod.GET;
  dispatcherPOST = mod.POST;
});
import { createMockRequestEvent } from "../utils/mock-event";
import { createMockSuperAdmin, createDbAdapterStub } from "../utils/mock-factories";

function encodeSAMLResponse(inResponseTo?: string): string {
  const attribute = inResponseTo ? ` InResponseTo="${inResponseTo}"` : "";
  return Buffer.from(
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"${attribute}></samlp:Response>`,
  ).toString("base64");
}

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

  const createAcsEvent = (relayState: string, samlResponse: string) => {
    const event = createMockEvent("POST", "auth/saml/acs");
    const formData = new Map<string, string>();
    formData.set("SAMLResponse", samlResponse);
    formData.set("RelayState", relayState);

    (event as any).request = {
      method: "POST",
      headers: new Headers([["content-type", "application/x-www-form-urlencoded"]]),
      formData: vi.fn().mockResolvedValue(formData),
    };
    return event;
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

  it("should require an authenticated admin for SAML config", async () => {
    const anonymous = createMockEvent("GET", "auth/saml/config", {}, null, "t1");
    (anonymous as any).request = { method: "GET", headers: new Headers() };
    (anonymous as any).cookies = { get: vi.fn(), set: vi.fn() };

    const anonymousResponse = await dispatcherGET(anonymous as any);
    expect(anonymousResponse!.status).toBe(401);

    const editor = { _id: "editor1", email: "editor@test.com", role: "editor", isAdmin: false };
    const nonAdmin = createMockEvent("GET", "auth/saml/config", {}, editor, "t1");
    (nonAdmin as any).request = { method: "GET", headers: new Headers() };
    (nonAdmin as any).cookies = { get: vi.fn(), set: vi.fn() };

    const nonAdminResponse = await dispatcherGET(nonAdmin as any);
    expect(nonAdminResponse!.status).toBe(403);
  });

  it("should persist a valid SAML connection for admins", async () => {
    const admin = createMockSuperAdmin({ _id: "admin1" });
    const payload = {
      entryPoint: "https://idp.example.com/sso",
      cert: "-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----",
      issuer: "cms-entity",
    };
    const event = createMockEvent("POST", "auth/saml/config", payload, admin, "t1");
    (event as any).request = {
      method: "POST",
      headers: new Headers([["content-type", "application/json"]]),
      json: vi.fn().mockResolvedValue(payload),
    };
    (event as any).cookies = { get: vi.fn(), set: vi.fn() };

    const response = await dispatcherPOST(event as any);
    const result = await response!.json();
    expect(result.success).toBe(true);
    expect(result.data.id).toBe("conn_t1_sveltycms");
  });

  it("should reject an incomplete SAML connection payload", async () => {
    const admin = createMockSuperAdmin({ _id: "admin1" });
    const event = createMockEvent("POST", "auth/saml/config", {}, admin, "t1");
    (event as any).request = {
      method: "POST",
      headers: new Headers([["content-type", "application/json"]]),
      json: vi.fn().mockResolvedValue({ entryPoint: "https://idp.example.com/sso" }),
    };
    (event as any).cookies = { get: vi.fn(), set: vi.fn() };

    const response = await dispatcherPOST(event as any);
    expect(response!.status).toBe(400);
  });

  it("should reject malformed raw metadata with 400", async () => {
    const admin = createMockSuperAdmin({ _id: "admin1" });
    const payload = { rawMetadata: "<md:EntityDescriptor" };
    const event = createMockEvent("POST", "auth/saml/config", payload, admin, "t1");
    (event as any).request = {
      method: "POST",
      headers: new Headers([["content-type", "application/json"]]),
      json: vi.fn().mockResolvedValue(payload),
    };
    (event as any).cookies = { get: vi.fn(), set: vi.fn() };

    const response = await dispatcherPOST(event as any);
    expect(response!.status).toBe(400);
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
    expect(event.cookies.set).toHaveBeenCalledWith(
      "saml_request_id",
      expect.any(String),
      expect.objectContaining({
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 300,
      }),
    );
  });

  it("should process SAML ACS callback successfully when state and request ID match", async () => {
    const event = createAcsEvent("valid-state-token", encodeSAMLResponse("request-123"));
    (event as any).cookies = {
      get: vi.fn((name) => {
        if (name === "saml_state") return "valid-state-token";
        if (name === "saml_request_id") return "request-123";
        return null;
      }),
      delete: vi.fn(),
    };

    // DB operations use the global mock adapter (already set up in setup.ts)
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
    expect(event.cookies.delete).toHaveBeenCalledWith("saml_request_id", {
      path: "/",
    });
  });

  it("should block SAML ACS callback with 403 when state mismatched (CSRF Protection)", async () => {
    const event = createAcsEvent("attacker-state", encodeSAMLResponse("request-123"));
    (event as any).cookies = {
      get: vi.fn((name) => {
        if (name === "saml_state") return "victim-state";
        if (name === "saml_request_id") return "request-123";
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

  it("should block SAML ACS callback with 403 when the request ID cookie is missing", async () => {
    const event = createAcsEvent("valid-state-token", encodeSAMLResponse("request-123"));
    (event as any).cookies = {
      get: vi.fn((name) => {
        if (name === "saml_state") return "valid-state-token";
        return null;
      }),
      delete: vi.fn(),
    };

    const response = await dispatcherPOST(event as any);
    const result = await response!.json();
    expect(response!.status).toBe(403);
    expect(result.success).toBe(false);
    expect(result.message).toContain("InResponseTo");
  });

  it("should block SAML ACS callback with 403 when InResponseTo does not match", async () => {
    const event = createAcsEvent("valid-state-token", encodeSAMLResponse("attacker-request"));
    (event as any).cookies = {
      get: vi.fn((name) => {
        if (name === "saml_state") return "valid-state-token";
        if (name === "saml_request_id") return "expected-request";
        return null;
      }),
      delete: vi.fn(),
    };

    const response = await dispatcherPOST(event as any);
    const result = await response!.json();
    expect(response!.status).toBe(403);
    expect(result.success).toBe(false);
    expect(result.message).toContain("InResponseTo");
  });
});
