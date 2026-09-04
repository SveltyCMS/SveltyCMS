/**
 * @file tests/unit/auth/sso/sso-providers-handler.test.ts
 * @description Unit tests for SSO/OIDC providers management route handler (GET, POST, RBAC, secret masking).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { handleSsoProvidersRoute } from "@src/routes/api/[...path]/handlers/auth";
import type { DatabaseId } from "@src/content/types";
import {
  clearSsoProviders,
  registerSsoProvider,
  getAllSsoProviders,
  type SsoProviderConfig,
} from "@src/databases/auth/sso-session";

describe("handleSsoProvidersRoute", () => {
  const adminUser = {
    _id: "admin-1",
    email: "admin@example.com",
    role: "admin",
    isAdmin: true,
  };

  const editorUser = {
    _id: "editor-1",
    email: "editor@example.com",
    role: "editor",
    isAdmin: false,
  };

  const mockCms = {} as any;
  const tenantId = "test-tenant" as DatabaseId;

  beforeEach(() => {
    clearSsoProviders();
    registerSsoProvider({
      id: "google",
      name: "Google Workspace",
      icon: "flat-color-icons:google",
      issuer: "https://accounts.google.com",
      clientId: "google-client-id-123",
      clientSecret: "top-secret-google-key",
      allowedRedirectUris: ["https://example.com/callback"],
      defaultRole: "editor",
    });
  });

  describe("GET /api/auth/sso-providers", () => {
    it("returns public metadata (stripped secrets and clientId) for non-admin callers", async () => {
      const event = {
        request: { method: "GET" },
        url: new URL("http://localhost/api/auth/sso-providers"),
      } as any;

      const response = await handleSsoProvidersRoute(event, mockCms, tenantId, editorUser);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(1);

      const provider = body.data[0];
      expect(provider.id).toBe("google");
      expect(provider.name).toBe("Google Workspace");
      expect(provider.icon).toBe("flat-color-icons:google");
      expect(provider.authUrl).toBe("/api/auth/oidc-login?provider=google");

      // Critical security check: clientSecret and clientId must NOT leak to non-admins
      expect(provider.clientSecret).toBeUndefined();
      expect(provider.clientId).toBeUndefined();
      expect(provider.issuer).toBeUndefined();
    });

    it("returns complete configuration with masked secrets for admin callers", async () => {
      const event = {
        request: { method: "GET" },
        url: new URL("http://localhost/api/auth/sso-providers"),
      } as any;

      const response = await handleSsoProvidersRoute(event, mockCms, tenantId, adminUser);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);

      const provider = body.data[0];
      expect(provider.id).toBe("google");
      expect(provider.name).toBe("Google Workspace");
      expect(provider.clientId).toBe("google-client-id-123");
      expect(provider.issuer).toBe("https://accounts.google.com");
      expect(provider.defaultRole).toBe("editor");

      // Secret must be masked with bullet characters, never raw plaintext
      expect(provider.clientSecret).toBe("••••••••");
    });
  });

  describe("POST /api/auth/sso-providers", () => {
    it("rejects non-admin users with 403 Forbidden", async () => {
      const event = {
        request: {
          method: "POST",
          json: async () => [],
        },
        url: new URL("http://localhost/api/auth/sso-providers"),
      } as any;

      await expect(
        handleSsoProvidersRoute(event, mockCms, tenantId, editorUser),
      ).rejects.toMatchObject({
        status: 403,
      });
    });

    it("rejects requests where payload is not an array with 400 Bad Request", async () => {
      const event = {
        request: {
          method: "POST",
          json: async () => ({ id: "single-object" }),
        },
        url: new URL("http://localhost/api/auth/sso-providers"),
      } as any;

      await expect(
        handleSsoProvidersRoute(event, mockCms, tenantId, adminUser),
      ).rejects.toMatchObject({
        status: 400,
      });
    });

    it("rejects provider configuration missing id or issuer with 400 Bad Request", async () => {
      const event = {
        request: {
          method: "POST",
          json: async () => [{ id: "missing-issuer", issuer: "" }],
        },
        url: new URL("http://localhost/api/auth/sso-providers"),
      } as any;

      await expect(
        handleSsoProvidersRoute(event, mockCms, tenantId, adminUser),
      ).rejects.toMatchObject({
        status: 400,
      });
    });

    it("saves new providers with plaintext secret and returns masked response", async () => {
      const newPayload: SsoProviderConfig[] = [
        {
          id: "azure-ad",
          name: "Microsoft Entra ID",
          issuer: "https://login.microsoftonline.com/tenant-id/v2.0",
          clientId: "azure-client-id",
          clientSecret: "my-azure-secret",
          allowedRedirectUris: ["https://example.com/logout"],
          jitProvisioning: true,
          defaultRole: "viewer",
          roleMapping: {
            claimField: "groups",
            rules: [{ claimValue: "AdminGroup", role: "admin" }],
          },
        },
      ];

      const event = {
        request: {
          method: "POST",
          json: async () => newPayload,
        },
        url: new URL("http://localhost/api/auth/sso-providers"),
      } as any;

      const response = await handleSsoProvidersRoute(event, mockCms, tenantId, adminUser);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.count).toBe(1);

      // Verify internal state retains unmasked secret
      const internalProviders = getAllSsoProviders();
      expect(internalProviders).toHaveLength(1);
      expect(internalProviders[0].clientSecret).toBe("my-azure-secret");
      expect(internalProviders[0].jitProvisioning).toBe(true);
      expect(internalProviders[0].roleMapping?.rules).toHaveLength(1);
    });

    it("preserves existing clientSecret when placeholder bullet string is submitted", async () => {
      const updatePayload = [
        {
          id: "google",
          name: "Google Workspace Updated",
          issuer: "https://accounts.google.com",
          clientId: "google-client-id-123",
          clientSecret: "••••••••", // Placeholder submitted from form
          allowedRedirectUris: ["https://example.com/callback"],
          defaultRole: "admin",
        },
      ];

      const event = {
        request: {
          method: "POST",
          json: async () => updatePayload,
        },
        url: new URL("http://localhost/api/auth/sso-providers"),
      } as any;

      const response = await handleSsoProvidersRoute(event, mockCms, tenantId, adminUser);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.count).toBe(1);

      // Verify original secret "top-secret-google-key" was preserved, NOT overwritten with bullet characters
      const internal = getAllSsoProviders();
      expect(internal[0].name).toBe("Google Workspace Updated");
      expect(internal[0].defaultRole).toBe("admin");
      expect(internal[0].clientSecret).toBe("top-secret-google-key");
    });
  });
});
