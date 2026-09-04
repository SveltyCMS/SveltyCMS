/**
 * @file tests/unit/auth/sso/oidc-pkce-jit.test.ts
 * @description Unit tests for RFC 7636 PKCE and Just-In-Time (JIT) OIDC role mapping.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import {
  generatePkce,
  resolveJitRole,
  registerSsoProvider,
  clearSsoProviders,
  getAllSsoProviders,
  getPublicSsoProviders,
  buildOidcAuthorizationUrl,
  type SsoProviderConfig,
} from "@src/databases/auth/sso-session";

describe("RFC 7636 PKCE (Proof Key for Code Exchange)", () => {
  it("generates a high-entropy code_verifier and matching S256 code_challenge", () => {
    const { codeVerifier, codeChallenge } = generatePkce();

    expect(codeVerifier).toBeDefined();
    expect(codeChallenge).toBeDefined();
    expect(typeof codeVerifier).toBe("string");
    expect(typeof codeChallenge).toBe("string");

    // base64url string length for 32 bytes is 43 characters
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeChallenge.length).toBeGreaterThanOrEqual(43);

    // Verify RFC 7636 S256 calculation: BASE64URL(SHA256(code_verifier))
    const expectedChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    expect(codeChallenge).toBe(expectedChallenge);
  });

  it("generates unique verifier and challenge pairs on consecutive calls", () => {
    const pkce1 = generatePkce();
    const pkce2 = generatePkce();

    expect(pkce1.codeVerifier).not.toBe(pkce2.codeVerifier);
    expect(pkce1.codeChallenge).not.toBe(pkce2.codeChallenge);
  });
});

describe("Just-In-Time (JIT) Role Resolution", () => {
  const baseConfig: SsoProviderConfig = {
    id: "okta",
    issuer: "https://example.okta.com",
    allowedRedirectUris: ["https://example.com/callback"],
    defaultRole: "viewer",
    roleMapping: {
      claimField: "groups",
      rules: [
        { claimValue: "CMS-Admins", role: "admin" },
        { claimValue: "CMS-Editors", role: "editor" },
        { claimValue: "CMS-Authors", role: "author" },
      ],
    },
  };

  it("returns defaultRole when no rules are configured", () => {
    const configNoRules: SsoProviderConfig = {
      id: "test",
      issuer: "https://idp.test",
      allowedRedirectUris: [],
      defaultRole: "guest",
    };

    const role = resolveJitRole({ groups: ["CMS-Admins"] }, configNoRules);
    expect(role).toBe("guest");
  });

  it("resolves role when claim is an array of group names", () => {
    const claims = {
      email: "jane@example.com",
      groups: ["General-Users", "CMS-Editors", "Beta-Testers"],
    };

    const role = resolveJitRole(claims, baseConfig);
    expect(role).toBe("editor");
  });

  it("resolves role when claim is a single string", () => {
    const claims = {
      email: "admin@example.com",
      groups: "CMS-Admins",
    };

    const role = resolveJitRole(claims, baseConfig);
    expect(role).toBe("admin");
  });

  it("falls back to defaultRole when claim values do not match any rule", () => {
    const claims = {
      email: "visitor@example.com",
      groups: ["Unrelated-Group", "Audience"],
    };

    const role = resolveJitRole(claims, baseConfig);
    expect(role).toBe("viewer");
  });

  it("falls back to 'user' if defaultRole is unspecified", () => {
    const configNoDefault: SsoProviderConfig = {
      id: "test",
      issuer: "https://idp.test",
      allowedRedirectUris: [],
      roleMapping: {
        claimField: "roles",
        rules: [{ claimValue: "SuperAdmin", role: "admin" }],
      },
    };

    const role = resolveJitRole({ roles: ["Other"] }, configNoDefault);
    expect(role).toBe("user");
  });

  it("respects custom claim field names (e.g. roles or department)", () => {
    const customConfig: SsoProviderConfig = {
      id: "azure",
      issuer: "https://login.microsoftonline.com",
      allowedRedirectUris: [],
      defaultRole: "user",
      roleMapping: {
        claimField: "roles",
        rules: [{ claimValue: "Directory.Reader", role: "auditor" }],
      },
    };

    const role = resolveJitRole({ roles: ["Directory.Reader"] }, customConfig);
    expect(role).toBe("auditor");
  });
});

describe("SSO Provider Management & Public Metadata", () => {
  beforeEach(() => {
    clearSsoProviders();
  });

  it("registers providers and retrieves public metadata safely", () => {
    registerSsoProvider({
      id: "google",
      name: "Google Workspace",
      icon: "flat-color-icons:google",
      issuer: "https://accounts.google.com",
      clientId: "my-client-id",
      clientSecret: "super-secret-key",
      allowedRedirectUris: ["https://example.com/logout"],
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      defaultRole: "editor",
    });

    const all = getAllSsoProviders();
    expect(all).toHaveLength(1);
    expect(all[0].clientSecret).toBe("super-secret-key");

    const publicProviders = getPublicSsoProviders();
    expect(publicProviders).toHaveLength(1);
    expect(publicProviders[0]).toEqual({
      id: "google",
      name: "Google Workspace",
      icon: "flat-color-icons:google",
      authUrl: "/api/auth/oidc-login?provider=google",
    });
    // Ensure secrets and private details are NOT present on public metadata
    expect((publicProviders[0] as any).clientSecret).toBeUndefined();
    expect((publicProviders[0] as any).clientId).toBeUndefined();
  });

  it("builds authorization URL with PKCE challenge and S256 method", async () => {
    registerSsoProvider({
      id: "auth0",
      clientId: "auth0-client-id",
      issuer: "https://example.auth0.com",
      authorizationEndpoint: "https://example.auth0.com/authorize",
      allowedRedirectUris: [],
    });

    const { codeChallenge } = generatePkce();
    const result = await buildOidcAuthorizationUrl("auth0", {
      redirectUri: "https://cms.test/api/auth/oidc-callback",
      state: "state123",
      nonce: "nonce456",
      codeChallenge,
      codeChallengeMethod: "S256",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const parsed = new URL(result.url);
      expect(parsed.origin).toBe("https://example.auth0.com");
      expect(parsed.pathname).toBe("/authorize");
      expect(parsed.searchParams.get("client_id")).toBe("auth0-client-id");
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("code_challenge")).toBe(codeChallenge);
      expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
      expect(parsed.searchParams.get("state")).toBe("state123");
      expect(parsed.searchParams.get("nonce")).toBe("nonce456");
    }
  });
});
