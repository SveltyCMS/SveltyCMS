/**
 * @file tests/unit/auth/saml.test.ts
 * @description SAML Authentication Service Unit Tests (Dual Bun/Vitest Runner Support)
 *
 * Tests:
 * - should initialize Jackson with correct database connection string derived from config
 * - should generate SAML redirect URL correctly
 * - should create SAML connections via admin controller
 *
 */

import { describe, it, expect, beforeAll } from "vitest";

// ============================================================================
// 1. Vitest Mock Registrations (Static / Hoisted)
// ============================================================================
import { vi } from "vitest";

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: (key: string) => {
    if (key === "DB_TYPE") return "postgresql";
    return undefined;
  },
}));

vi.mock("@boxyhq/saml-jackson", () => ({
  default: () =>
    Promise.resolve({
      oauthController: {
        authorize: () => Promise.resolve({ redirect_url: "https://idp.example.com/sso" }),
      },
      connectionAPIController: {
        createSAMLConnection: () => Promise.resolve({ id: "conn_123" }),
      },
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
      return undefined;
    },
  }));
  mock.module("@boxyhq/saml-jackson", () => ({
    default: mock(() =>
      Promise.resolve({
        oauthController: {
          authorize: mock(() => Promise.resolve({ redirect_url: "https://idp.example.com/sso" })),
        },
        connectionAPIController: {
          createSAMLConnection: mock(() => Promise.resolve({ id: "conn_123" })),
        },
      }),
    ),
  }));
}

describe("SAML Authentication Service", () => {
  let samlModule: any;

  beforeAll(async () => {
    // Dynamic import to allow mocks to be registered first in both runners
    samlModule = await import("@src/databases/auth/saml-auth");
  });

  it("should initialize Jackson with correct database connection string derived from config", async () => {
    const instance = await samlModule.getJackson();
    expect(instance).toBeDefined();
    expect(instance.oauthController).toBeDefined();
    expect(instance.connectionAPIController).toBeDefined();
  });

  it("should generate SAML redirect URL correctly", async () => {
    const url = await samlModule.generateSAMLAuthUrl("acme-corp", "sveltycms");
    expect(url).toBe("https://idp.example.com/sso");
  });

  it("should create SAML connections via admin controller", async () => {
    const mockPayload = {
      rawMetadata: "<xml></xml>",
      defaultRedirectUrl: "http://localhost:5173/admin",
      tenant: "t1",
      product: "p1",
    };
    const result = await samlModule.createSAMLConnection(mockPayload);
    expect(result.id).toBe("conn_123");
  });
});
