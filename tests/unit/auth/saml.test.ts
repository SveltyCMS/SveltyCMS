/**
 * @file tests/unit/auth/saml.test.ts
 * @description SAML Authentication Service Unit Tests (Dual Bun/Vitest Runner Support)
 *
 * Tests:
 * - should generate SAML authorize URL correctly
 * - should create SAML connections via admin controller
 * - should process SAML response profile extraction
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

// ============================================================================
// 1. Vitest Mock Registrations (Static / Hoisted)
// ============================================================================

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    auth: {
      getUserByEmail: vi.fn().mockResolvedValue({
        success: true,
        data: { _id: "user123", email: "user@test.com" },
      }),
      createUser: vi.fn().mockResolvedValue({
        success: true,
        data: { _id: "new-user", email: "user@test.com" },
      }),
      createSession: vi.fn().mockResolvedValue({
        success: true,
        data: { _id: "session123" },
      }),
    },
  },
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: (key: string) => {
    if (key === "DB_TYPE") return "postgresql";
    if (key === "SAML_ENTRY_POINT") return "https://idp.example.com/sso";
    if (key === "SAML_IDP_CERT")
      return "-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----";
    return undefined;
  },
}));

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
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname": "Test",
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname": "User",
        },
      },
    });
  }),
}));

// ============================================================================
// 2. Bun Mock Registrations (Dynamic / Runtime conditional)
// ============================================================================
const isBun = typeof Bun !== "undefined";
if (isBun) {
  const bunTestName = "bun:test";
  const { mock } = await import(bunTestName);
  mock.module("@src/services/core/settings-service", () => ({
    getPrivateSettingSync: (key: string) => {
      if (key === "DB_TYPE") return "postgresql";
      if (key === "SAML_ENTRY_POINT") return "https://idp.example.com/sso";
      return undefined;
    },
  }));
  mock.module("@node-saml/node-saml", () => ({
    SAML: mock(function (this: any) {
      this.getAuthorizeUrlAsync = mock(() =>
        Promise.resolve("https://idp.example.com/sso?SAMLRequest=..."),
      );
      this.validatePostResponseAsync = mock(() =>
        Promise.resolve({
          profile: {
            nameID: "user@test.com",
            attributes: {
              "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": "user@test.com",
              "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname": "Test",
              "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname": "User",
            },
          },
        }),
      );
    }),
  }));
}

describe("SAML Authentication Service", () => {
  let samlModule: any;

  beforeAll(async () => {
    // Dynamic import to allow mocks to be registered first in both runners
    samlModule = await import("@src/databases/auth/saml-auth");
    // Reset cache from any previous test runs
    samlModule._resetSAMLCache();
  });

  it("should generate SAML redirect URL correctly", async () => {
    const url = await samlModule.generateSAMLAuthUrl("acme-corp", "sveltycms");
    expect(url).toBe("https://idp.example.com/sso?SAMLRequest=...");
  });

  it("should create SAML connections via admin controller", async () => {
    const mockPayload = {
      tenant: "t1",
      product: "p1",
      entryPoint: "https://idp.corp.com/sso",
      cert: "-----BEGIN CERTIFICATE-----\nREAL\n-----END CERTIFICATE-----",
    };
    const result = await samlModule.createSAMLConnection(mockPayload);
    expect(result.id).toBe("conn_t1_p1");
    expect(result.tenant).toBe("t1");
    expect(result.product).toBe("p1");
  });

  it("should process SAML response and extract email from profile", async () => {
    const result = await samlModule.processSAMLResponse("mock-saml-response", "valid-state");
    expect(result).toBeDefined();
    expect(result.user).toBeDefined();
    expect(result.session).toBeDefined();
  });
});
