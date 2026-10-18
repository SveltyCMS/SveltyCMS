/**
 * @file tests/unit/auth/sso-session.test.ts
 * @description Real behaviour of the OIDC/SSO session helpers.
 *
 * `sso-session.ts` was at 33% lines; the pure security-relevant paths (PKCE,
 * JIT role resolution, redirect-URI allowlists, provider registry, RP-initiated
 * logout) had no direct unit coverage. Only the DB/cache/settings boundaries are
 * faked.
 *
 * ### Features:
 * - PKCE verifier/challenge RFC 7636 relationship
 * - JIT role mapping (default, string claims, array claims, first match)
 * - provider registry + public metadata (no secrets leaked)
 * - post-logout redirect allowlist: exact, case-insensitive, wildcard, dots
 * - SSO metadata local/L2 round-trip and delete
 * - RP-initiated logout with an explicit end-session endpoint
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac, createSign, generateKeyPairSync } from "node:crypto";
import type { DatabaseId } from "@src/content/types";

const h = vi.hoisted(() => ({
  getUntypedSetting: vi.fn<(key: string, scope?: string, tenantId?: string) => Promise<unknown>>(
    async () => undefined,
  ),
  invalidateSettingsCache: vi.fn(),
  preferenceSet: vi.fn(async () => {}),
  validateEgressUrl: vi.fn(async () => ({ ok: true })),
  safeFetch: vi.fn<(url: string, opts?: any) => Promise<any>>(async () => ({
    success: true,
    status: 200,
    body: "",
    bodyBytes: 0,
    headers: new Headers(),
    error: undefined,
  })),
}));

vi.mock("@src/services/core/settings-service", () => ({
  getUntypedSetting: h.getUntypedSetting,
  invalidateSettingsCache: h.invalidateSettingsCache,
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: { system: { preferences: { set: h.preferenceSet } } },
}));

vi.mock("@src/utils/egress-guard", () => ({
  validateEgressUrl: h.validateEgressUrl,
  safeFetch: h.safeFetch,
}));

import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import {
  buildOidcAuthorizationUrl,
  clearSsoProviders,
  deleteSsoSessionMetadata,
  discoverEndSessionEndpoint,
  discoverOidcConfig,
  exchangeOidcCode,
  generatePkce,
  getAllSsoProviders,
  getPublicSsoProviders,
  getSsoProvider,
  getSsoSessionMetadata,
  handleBackChannelLogout,
  handleFrontChannelLogout,
  loadSsoProvidersFromSettings,
  performRpInitiatedLogout,
  registerSsoProvider,
  resolveJitRole,
  saveSsoProviders,
  setSsoSessionMetadata,
  validatePostLogoutRedirectUri,
  verifyJwtWithProviderJwks,
  type SsoProviderConfig,
} from "@src/databases/auth/sso-session";

const PROVIDER: SsoProviderConfig = {
  id: "acme",
  name: "Acme ID",
  issuer: "https://id.acme.test",
  clientId: "client-1",
  clientSecret: "super-secret",
  allowedRedirectUris: ["https://cms.test/auth/logout", "https://*.acme.test/logged-out"],
  endSessionEndpoint: "https://id.acme.test/logout",
};

beforeEach(() => {
  clearSsoProviders();
  h.getUntypedSetting.mockReset();
  h.getUntypedSetting.mockResolvedValue(undefined);
  h.invalidateSettingsCache.mockReset();
  h.preferenceSet.mockReset();
  vi.mocked(cacheService.get).mockReset();
  vi.mocked(cacheService.get).mockResolvedValue(null);
  vi.mocked(cacheService.set).mockReset();
  vi.mocked(cacheService.delete).mockReset();
  h.validateEgressUrl.mockReset();
  h.validateEgressUrl.mockResolvedValue({ ok: true });
  h.safeFetch.mockReset();
  h.safeFetch.mockResolvedValue({
    success: true,
    status: 200,
    body: "",
    bodyBytes: 0,
    headers: new Headers(),
    error: undefined,
  });
});

describe("generatePkce", () => {
  it("returns an RFC 7636 verifier and its S256 challenge", () => {
    const { codeVerifier, codeChallenge } = generatePkce();

    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codeChallenge).toBe(createHash("sha256").update(codeVerifier).digest("base64url"));
    expect(codeChallenge).not.toBe(codeVerifier);
  });

  it("generates a fresh verifier every call", () => {
    expect(generatePkce().codeVerifier).not.toBe(generatePkce().codeVerifier);
  });
});

describe("resolveJitRole", () => {
  const provider: SsoProviderConfig = {
    ...PROVIDER,
    defaultRole: "user",
    roleMapping: {
      claimField: "groups",
      rules: [
        { claimValue: "cms-admins", role: "admin" },
        { claimValue: "cms-editors", role: "editor" },
      ],
    },
  };

  it("falls back to the configured default role", () => {
    expect(resolveJitRole({}, provider)).toBe("user");
    expect(resolveJitRole({}, { ...PROVIDER, defaultRole: "editor" })).toBe("editor");
    expect(resolveJitRole({}, { ...provider, roleMapping: undefined })).toBe("user");
  });

  it("maps array and string claims, first rule wins", () => {
    expect(resolveJitRole({ groups: ["devs", "cms-admins"] }, provider)).toBe("admin");
    expect(resolveJitRole({ groups: "cms-editors" }, provider)).toBe("editor");
    expect(resolveJitRole({ groups: ["cms-admins", "cms-editors"] }, provider)).toBe("admin");
  });

  it("honours a custom claim field and ignores non-string values", () => {
    const custom = {
      ...provider,
      roleMapping: {
        claimField: "roles",
        rules: [{ claimValue: "42", role: "auditor" }],
      },
    };
    expect(resolveJitRole({ roles: [42] }, custom)).toBe("auditor");
    expect(resolveJitRole({ groups: ["cms-admins"] }, custom)).toBe("user");
  });
});

describe("provider registry", () => {
  it("registers, retrieves, and exposes public metadata without secrets", () => {
    registerSsoProvider(PROVIDER);

    expect(getSsoProvider("acme")).toEqual(PROVIDER);
    expect(getAllSsoProviders()).toHaveLength(1);
    expect(getPublicSsoProviders()).toEqual([
      {
        id: "acme",
        name: "Acme ID",
        icon: "mdi:shield-key-outline",
        authUrl: "/api/auth/oidc-login?provider=acme",
      },
    ]);
  });

  it("derives the display name and icon when omitted", () => {
    registerSsoProvider({
      id: "google",
      issuer: "https://accounts.google.com",
      allowedRedirectUris: [],
    });

    const [publicProvider] = getPublicSsoProviders();
    expect(publicProvider.name).toBe("Google");
    expect(publicProvider.icon).toBe("flat-color-icons:google");
  });

  it("clears the registry for test isolation", () => {
    registerSsoProvider(PROVIDER);
    clearSsoProviders();
    expect(getAllSsoProviders()).toEqual([]);
    expect(getSsoProvider("acme")).toBeUndefined();
  });

  it("isolates providers with the same id across tenants", () => {
    registerSsoProvider({ ...PROVIDER, issuer: "https://id.tenant-a.test" }, "tenant-a");
    registerSsoProvider({ ...PROVIDER, issuer: "https://id.tenant-b.test" }, "tenant-b");

    expect(getSsoProvider("acme", "tenant-a")?.issuer).toBe("https://id.tenant-a.test");
    expect(getSsoProvider("acme", "tenant-b")?.issuer).toBe("https://id.tenant-b.test");
    expect(getAllSsoProviders("tenant-a")).toHaveLength(1);
    expect(getAllSsoProviders("tenant-b")).toHaveLength(1);
    expect(getAllSsoProviders()).toHaveLength(2);

    // Clearing one tenant must not touch the other.
    clearSsoProviders("tenant-a");
    expect(getSsoProvider("acme", "tenant-a")).toBeUndefined();
    expect(getSsoProvider("acme", "tenant-b")?.issuer).toBe("https://id.tenant-b.test");
  });
});

describe("loadSsoProvidersFromSettings", () => {
  it("registers providers from a JSON string", async () => {
    h.getUntypedSetting.mockResolvedValueOnce(JSON.stringify([PROVIDER]));

    const providers = await loadSsoProvidersFromSettings("tenant-1");

    expect(h.getUntypedSetting).toHaveBeenCalledWith("SSO_PROVIDERS", "private", "tenant-1");
    expect(providers.map((p) => p.id)).toEqual(["acme"]);
  });

  it("registers providers from an array value", async () => {
    h.getUntypedSetting.mockResolvedValueOnce([PROVIDER]);

    expect((await loadSsoProvidersFromSettings()).map((p) => p.id)).toEqual(["acme"]);
  });

  it("keeps the current registry when the setting is absent or malformed", async () => {
    registerSsoProvider(PROVIDER);
    h.getUntypedSetting.mockResolvedValueOnce(undefined);
    expect((await loadSsoProvidersFromSettings()).map((p) => p.id)).toEqual(["acme"]);

    h.getUntypedSetting.mockResolvedValueOnce("{not-on-a-json");
    expect((await loadSsoProvidersFromSettings()).map((p) => p.id)).toEqual(["acme"]);
  });

  it("loads only the requested tenant's providers", async () => {
    registerSsoProvider({ ...PROVIDER, issuer: "https://id.global.test" });
    registerSsoProvider({ ...PROVIDER, issuer: "https://id.tenant-b.test" }, "tenant-b");
    h.getUntypedSetting.mockResolvedValueOnce([
      { ...PROVIDER, issuer: "https://id.tenant-a.test" },
    ]);

    const providers = await loadSsoProvidersFromSettings("tenant-a");

    expect(providers).toHaveLength(1);
    expect(providers[0].issuer).toBe("https://id.tenant-a.test");
    expect(getSsoProvider("acme", "tenant-b")?.issuer).toBe("https://id.tenant-b.test");
  });
});

describe("saveSsoProviders", () => {
  it("persists JSON, invalidates settings, and refreshes the registry", async () => {
    await saveSsoProviders([PROVIDER], "tenant-2");

    expect(h.preferenceSet).toHaveBeenCalledWith("SSO_PROVIDERS", JSON.stringify([PROVIDER]), {
      scope: "system",
      tenantId: "tenant-2",
    });
    expect(h.invalidateSettingsCache).toHaveBeenCalledWith("tenant-2");
    expect(getAllSsoProviders("tenant-2")).toEqual([PROVIDER]);
  });

  it("replaces only the target tenant's providers", async () => {
    registerSsoProvider({ ...PROVIDER, issuer: "https://id.other.test" }, "tenant-other");
    await saveSsoProviders([PROVIDER], "tenant-2");

    expect(getSsoProvider("acme", "tenant-other")?.issuer).toBe("https://id.other.test");
    expect(getSsoProvider("acme", "tenant-2")?.issuer).toBe(PROVIDER.issuer);
  });
});

describe("SSO session metadata", () => {
  const metadata = {
    provider: "acme",
    idTokenHint: "id-token",
    createdAt: "2026-10-18T00:00:00.000Z",
  };

  it("stores locally and through the distributed cache", async () => {
    await setSsoSessionMetadata("session-1", metadata, "tenant-1");

    expect(await getSsoSessionMetadata("session-1", "tenant-1")).toEqual(metadata);
    expect(cacheService.set).toHaveBeenCalledWith(
      "sso:session:session-1",
      metadata,
      7 * 24 * 3600,
      "tenant-1",
      CacheCategory.SESSION,
    );
  });

  it("hydrates from L2 when the local map misses", async () => {
    vi.mocked(cacheService.get).mockResolvedValueOnce(metadata);

    expect(await getSsoSessionMetadata("session-2")).toEqual(metadata);
    expect(cacheService.get).toHaveBeenCalledWith(
      "sso:session:session-2",
      "global",
      CacheCategory.SESSION,
    );
    // Second read comes from the local map, not L2.
    expect(await getSsoSessionMetadata("session-2")).toEqual(metadata);
    expect(cacheService.get).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when neither layer has metadata", async () => {
    expect(await getSsoSessionMetadata("missing")).toBeUndefined();
  });

  it("deletes local and distributed metadata", async () => {
    await setSsoSessionMetadata("session-3", metadata, "tenant-1");
    deleteSsoSessionMetadata("session-3", "tenant-1");

    expect(await getSsoSessionMetadata("session-3", "tenant-1")).toBeUndefined();
    expect(cacheService.delete).toHaveBeenCalledWith("sso:session:session-3", "tenant-1");
  });
});

describe("validatePostLogoutRedirectUri", () => {
  beforeEach(() => {
    registerSsoProvider(PROVIDER);
  });

  it("rejects unknown providers", () => {
    expect(validatePostLogoutRedirectUri("unknown", "https://cms.test/auth/logout")).toBe(false);
  });

  it("allows an omitted redirect and rejects when the allowlist is empty", () => {
    registerSsoProvider({ id: "empty", issuer: "https://empty.test", allowedRedirectUris: [] });
    expect(validatePostLogoutRedirectUri("empty", "")).toBe(true);
    expect(validatePostLogoutRedirectUri("empty", "https://cms.test/logout")).toBe(false);
  });

  it("matches exact entries case-insensitively", () => {
    expect(validatePostLogoutRedirectUri("acme", "https://cms.test/auth/logout")).toBe(true);
    expect(validatePostLogoutRedirectUri("acme", "HTTPS://CMS.TEST/AUTH/LOGOUT")).toBe(true);
    expect(validatePostLogoutRedirectUri("acme", "https://cms.test/other")).toBe(false);
  });

  it("escapes dots so the host cannot be widened", () => {
    expect(validatePostLogoutRedirectUri("acme", "https://cmsXtest/auth/logout")).toBe(false);
  });

  it("supports a subdomain wildcard without widening the suffix", () => {
    expect(validatePostLogoutRedirectUri("acme", "https://app.acme.test/logged-out")).toBe(true);
    expect(validatePostLogoutRedirectUri("acme", "https://a.b.acme.test/logged-out")).toBe(true);
    expect(validatePostLogoutRedirectUri("acme", "https://evil.com/logged-out")).toBe(false);
    expect(validatePostLogoutRedirectUri("acme", "https://acme.test.evil.com/logged-out")).toBe(
      false,
    );
  });
});

describe("performRpInitiatedLogout", () => {
  it("falls through to local logout for a non-SSO session", async () => {
    expect(await performRpInitiatedLogout({ sessionId: "missing" })).toEqual({
      success: true,
      message: "Local session terminated (not an SSO session)",
    });
  });

  it("builds the OP logout URL and deletes the metadata", async () => {
    registerSsoProvider(PROVIDER);
    await setSsoSessionMetadata(
      "session-4",
      {
        provider: "acme",
        idTokenHint: "stored-id-token",
        postLogoutRedirectUri: "https://cms.test/auth/logout",
        createdAt: "2026-10-18T00:00:00.000Z",
      },
      "tenant-1",
    );

    const result = await performRpInitiatedLogout({
      sessionId: "session-4",
      state: "logout-state",
      tenantId: "tenant-1" as DatabaseId,
    });

    expect(result.success).toBe(true);
    expect(result.endSessionUrl).toContain("https://id.acme.test/logout?");
    expect(result.endSessionUrl).toContain("id_token_hint=stored-id-token");
    expect(result.endSessionUrl).toContain(
      "post_logout_redirect_uri=https%3A%2F%2Fcms.test%2Fauth%2Flogout",
    );
    expect(result.endSessionUrl).toContain("state=logout-state");
    expect(await getSsoSessionMetadata("session-4", "tenant-1")).toBeUndefined();
  });

  it("rejects a redirect that is not on the allowlist without deleting metadata", async () => {
    registerSsoProvider(PROVIDER);
    await setSsoSessionMetadata("session-5", {
      provider: "acme",
      createdAt: "2026-10-18T00:00:00.000Z",
    });

    const result = await performRpInitiatedLogout({
      sessionId: "session-5",
      postLogoutRedirectUri: "https://evil.example/phish",
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not in provider allowlist/);
    expect(await getSsoSessionMetadata("session-5")).toBeDefined();
  });
});

describe("discoverOidcConfig and discoverEndSessionEndpoint", () => {
  it("returns undefined for an unknown provider", async () => {
    expect(await discoverOidcConfig("unknown-provider")).toBeUndefined();
    expect(await discoverEndSessionEndpoint("unknown-provider")).toBeUndefined();
  });

  it("fetches .well-known configuration, populates endpoints, and caches", async () => {
    const discProvider: SsoProviderConfig = {
      id: "disc-test",
      issuer: "https://id.disc.test",
      allowedRedirectUris: ["https://cms.test/logout"],
    };
    registerSsoProvider(discProvider);

    h.safeFetch.mockResolvedValueOnce({
      success: true,
      status: 200,
      body: JSON.stringify({
        end_session_endpoint: "https://id.disc.test/endsession",
        authorization_endpoint: "https://id.disc.test/auth",
        token_endpoint: "https://id.disc.test/token",
        jwks_uri: "https://id.disc.test/jwks.json",
      }),
      bodyBytes: 200,
      headers: new Headers(),
      error: null,
    });

    const result = await discoverOidcConfig("disc-test");
    expect(result).toBeDefined();
    expect(result?.endSessionEndpoint).toBe("https://id.disc.test/endsession");
    expect(result?.authorizationEndpoint).toBe("https://id.disc.test/auth");
    expect(result?.tokenEndpoint).toBe("https://id.disc.test/token");
    expect(result?.jwksUri).toBe("https://id.disc.test/jwks.json");

    // Also verify discoverEndSessionEndpoint returns the discovered URL
    expect(await discoverEndSessionEndpoint("disc-test")).toBe("https://id.disc.test/endsession");

    // Second call should read from discoveryCache without another safeFetch
    const cached = await discoverOidcConfig("disc-test");
    expect(cached?.endSessionEndpoint).toBe("https://id.disc.test/endsession");
    expect(h.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("handles discovery fetch failure gracefully with fallback", async () => {
    const failProvider: SsoProviderConfig = {
      id: "fail-test",
      issuer: "https://id.fail.test",
      endSessionEndpoint: "https://id.fail.test/default-end",
      allowedRedirectUris: [],
    };
    registerSsoProvider(failProvider);

    h.safeFetch.mockResolvedValueOnce({
      success: false,
      status: 500,
      body: "",
      bodyBytes: 0,
      headers: new Headers(),
      error: "Connection refused",
    });

    const result = await discoverOidcConfig("fail-test");
    expect(result?.endSessionEndpoint).toBe("https://id.fail.test/default-end");
  });
});

describe("verifyJwtWithProviderJwks", () => {
  it("rejects tokens with invalid format or mismatched issuer", async () => {
    const provider: SsoProviderConfig = {
      id: "jwt-test",
      issuer: "https://id.jwt-test.org",
      allowedRedirectUris: [],
    };

    expect(await verifyJwtWithProviderJwks("not-a-jwt", provider)).toEqual({
      valid: false,
      reason: "Invalid JWT format",
    });

    const badHeader = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
    const badPayload = Buffer.from(JSON.stringify({ iss: "https://evil.org" })).toString(
      "base64url",
    );
    const badToken = `${badHeader}.${badPayload}.fake-sig`;

    expect(await verifyJwtWithProviderJwks(badToken, provider)).toEqual({
      valid: false,
      reason: "iss mismatch",
    });
  });

  it("fails closed when no JWKS URI is configured or discovered", async () => {
    const provider: SsoProviderConfig = {
      id: "no-jwks",
      issuer: "https://id.no-jwks.test",
      clientId: "client-no-jwks",
      allowedRedirectUris: [],
    };
    registerSsoProvider(provider);

    const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: provider.issuer,
        aud: provider.clientId,
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
    ).toString("base64url");
    const token = `${header}.${payload}.sig`;

    const result = await verifyJwtWithProviderJwks(token, provider);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("no_jwks_configured");
  });

  it("rejects HMAC-signed tokens even when a client secret is configured", async () => {
    const secret = "test-secret-key-12345678901234567890";
    const provider: SsoProviderConfig = {
      id: "hmac-test",
      issuer: "https://id.hmac.test",
      clientId: "client-hmac",
      clientSecret: secret,
      jwksUri: "https://id.hmac.test/jwks",
      allowedRedirectUris: [],
    };

    const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
    const payloadObj = {
      iss: provider.issuer,
      sub: "user-123",
      aud: provider.clientId,
      exp: Math.floor(Date.now() / 1000) + 300,
    };
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
    const data = `${header}.${payload}`;

    const hmac = createHmac("sha256", secret);
    hmac.update(data);
    const validSig = hmac.digest("base64url");
    const hmacToken = `${data}.${validSig}`;

    const result = await verifyJwtWithProviderJwks(hmacToken, provider);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Unsupported alg/i);
  });

  it("verifies RS256 RSA-signed tokens with published JWK key", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" }) as any;
    jwk.kid = "test-rsa-kid-1";
    jwk.alg = "RS256";

    const provider: SsoProviderConfig = {
      id: "rsa-test",
      issuer: "https://id.rsa.test",
      clientId: "cms",
      jwksUri: "https://id.rsa.test/jwks",
      allowedRedirectUris: [],
    };
    registerSsoProvider(provider);

    h.safeFetch.mockResolvedValue({
      success: true,
      status: 200,
      body: JSON.stringify({ keys: [jwk] }),
      bodyBytes: 500,
      headers: new Headers(),
      error: null,
    });

    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-rsa-kid-1" })).toString(
      "base64url",
    );
    const payloadObj = {
      iss: provider.issuer,
      sub: "user-rsa",
      aud: "cms",
      exp: Math.floor(Date.now() / 1000) + 300,
    };
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
    const data = `${header}.${payload}`;

    const signer = createSign("RSA-SHA256");
    signer.update(data);
    const sig = signer.sign(privateKey, "base64url");

    const token = `${data}.${sig}`;
    const result = await verifyJwtWithProviderJwks(token, provider);
    expect(result.valid).toBe(true);
    expect(result.payload?.sub).toBe("user-rsa");

    // Tampered payload fails verification
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        iss: provider.issuer,
        sub: "hacker",
        aud: "cms",
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
    ).toString("base64url");
    const tamperedToken = `${header}.${tamperedPayload}.${sig}`;
    const tamperedResult = await verifyJwtWithProviderJwks(tamperedToken, provider);
    expect(tamperedResult.valid).toBe(false);
    expect(tamperedResult.reason).toBe("Signature verification failed");
  });
});

describe("buildOidcAuthorizationUrl", () => {
  it("rejects missing provider or missing clientId", async () => {
    expect(
      await buildOidcAuthorizationUrl("missing", {
        redirectUri: "https://cms.test/cb",
        state: "s",
      }),
    ).toEqual({ success: false, message: "Unknown provider" });

    registerSsoProvider({
      id: "no-client",
      issuer: "https://id.test",
      allowedRedirectUris: [],
    });

    expect(
      await buildOidcAuthorizationUrl("no-client", {
        redirectUri: "https://cms.test/cb",
        state: "s",
      }),
    ).toEqual({ success: false, message: "Provider missing clientId" });
  });

  it("constructs full authorization URL with params, PKCE, and nonce", async () => {
    registerSsoProvider({
      id: "auth-test",
      issuer: "https://id.auth.test",
      clientId: "my-client-id",
      authorizationEndpoint: "https://id.auth.test/oauth/authorize",
      scopes: ["openid", "profile", "email", "roles"],
      allowedRedirectUris: [],
    });

    const res = await buildOidcAuthorizationUrl("auth-test", {
      redirectUri: "https://cms.test/auth/callback",
      state: "state-token-123",
      nonce: "nonce-456",
      codeChallenge: "challenge-789",
      codeChallengeMethod: "S256",
    });

    expect(res.success).toBe(true);
    if (!res.success) return;

    const parsed = new URL(res.url);
    expect(parsed.origin).toBe("https://id.auth.test");
    expect(parsed.pathname).toBe("/oauth/authorize");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_id")).toBe("my-client-id");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://cms.test/auth/callback");
    expect(parsed.searchParams.get("scope")).toBe("openid profile email roles");
    expect(parsed.searchParams.get("state")).toBe("state-token-123");
    expect(parsed.searchParams.get("nonce")).toBe("nonce-456");
    expect(parsed.searchParams.get("code_challenge")).toBe("challenge-789");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("exchangeOidcCode", () => {
  it("rejects unknown provider or missing clientId", async () => {
    const res = await exchangeOidcCode("missing", {
      code: "c",
      redirectUri: "https://cms.test/cb",
    });
    expect(res.success).toBe(false);
  });

  it("handles token endpoint HTTP error response", async () => {
    registerSsoProvider({
      id: "ex-test",
      issuer: "https://id.ex.test",
      clientId: "client-ex",
      tokenEndpoint: "https://id.ex.test/oauth/token",
      allowedRedirectUris: [],
    });

    h.safeFetch.mockImplementation(async (url: string) => {
      if (url.includes(".well-known")) {
        return {
          success: true,
          status: 200,
          body: JSON.stringify({ token_endpoint: "https://id.ex.test/oauth/token" }),
          bodyBytes: 100,
          headers: new Headers(),
          error: null,
        };
      }
      if (url.includes("/oauth/token")) {
        return {
          success: false,
          status: 400,
          body: JSON.stringify({ error: "invalid_grant" }),
          bodyBytes: 30,
          headers: new Headers(),
          error: "Bad request",
        };
      }
      return {
        success: false,
        status: 404,
        body: "",
        bodyBytes: 0,
        headers: new Headers(),
        error: "Not found",
      };
    });

    const res = await exchangeOidcCode("ex-test", {
      code: "invalid-code",
      redirectUri: "https://cms.test/cb",
    });

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.message).toContain("Token exchange failed");
    }
  });

  it("exchanges code for tokens and verifies id_token via JWKS", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" }) as any;
    jwk.kid = "kid-ex";
    jwk.alg = "RS256";

    const provider: SsoProviderConfig = {
      id: "ex-success",
      issuer: "https://id.ex-succ.test",
      clientId: "client-success",
      clientSecret: "secret-success",
      tokenEndpoint: "https://id.ex-succ.test/token",
      jwksUri: "https://id.ex-succ.test/jwks",
      allowedRedirectUris: [],
    };
    registerSsoProvider(provider);

    // Build valid signed id_token
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "kid-ex" })).toString(
      "base64url",
    );
    const payloadObj = {
      iss: provider.issuer,
      sub: "user-sso-1",
      email: "sso@test.org",
      aud: provider.clientId,
      exp: Math.floor(Date.now() / 1000) + 300,
    };
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    const sig = signer.sign(privateKey, "base64url");
    const idToken = `${header}.${payload}.${sig}`;

    h.safeFetch.mockImplementation(async (url: string) => {
      if (url.includes(".well-known")) {
        return {
          success: true,
          status: 200,
          body: JSON.stringify({
            token_endpoint: "https://id.ex-succ.test/token",
            jwks_uri: "https://id.ex-succ.test/jwks",
          }),
          bodyBytes: 100,
          headers: new Headers(),
          error: null,
        };
      }
      if (url.includes("/token")) {
        return {
          success: true,
          status: 200,
          body: JSON.stringify({
            id_token: idToken,
            access_token: "mock-access-token-xyz",
          }),
          bodyBytes: 300,
          headers: new Headers(),
          error: null,
        };
      }
      if (url.includes("/jwks")) {
        return {
          success: true,
          status: 200,
          body: JSON.stringify({ keys: [jwk] }),
          bodyBytes: 400,
          headers: new Headers(),
          error: null,
        };
      }
      return {
        success: false,
        status: 404,
        body: "",
        bodyBytes: 0,
        headers: new Headers(),
        error: "Not found",
      };
    });

    const res = await exchangeOidcCode("ex-success", {
      code: "valid-auth-code",
      redirectUri: "https://cms.test/cb",
      codeVerifier: "pkce-verifier-123",
    });

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.idToken).toBe(idToken);
    expect(res.accessToken).toBe("mock-access-token-xyz");
    expect(res.payload?.sub).toBe("user-sso-1");
    expect(res.payload?.email).toBe("sso@test.org");
  });
});

describe("handleFrontChannelLogout", () => {
  it("clears matching sessions by issuer and returns 200 with no-cache headers", async () => {
    registerSsoProvider(PROVIDER);
    await setSsoSessionMetadata("front-sess-1", {
      provider: "acme",
      createdAt: "2026-10-18T00:00:00.000Z",
    });

    const resp = await handleFrontChannelLogout("https://id.acme.test", "front-sid-1");
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Cache-Control")).toBe("no-cache, no-store, must-revalidate");
    expect(await getSsoSessionMetadata("front-sess-1")).toBeUndefined();
  });
});

describe("handleBackChannelLogout", () => {
  it("validates token structure and required claims", async () => {
    expect(await handleBackChannelLogout("invalid-token")).toEqual({
      success: false,
      message: "Invalid logout token format",
    });

    // Missing iss
    const h1 = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const p1 = Buffer.from(JSON.stringify({})).toString("base64url");
    expect(await handleBackChannelLogout(`${h1}.${p1}.sig`)).toEqual({
      success: false,
      message: "Missing iss claim",
    });

    // Missing events
    const p2 = Buffer.from(JSON.stringify({ iss: "https://id.test" })).toString("base64url");
    expect(await handleBackChannelLogout(`${h1}.${p2}.sig`)).toEqual({
      success: false,
      message: "Missing backchannel-logout event",
    });

    // Missing sub and sid
    const p3 = Buffer.from(
      JSON.stringify({
        iss: "https://id.test",
        events: { "http://schemas.openid.net/event/backchannel-logout": {} },
      }),
    ).toString("base64url");
    expect(await handleBackChannelLogout(`${h1}.${p3}.sig`)).toEqual({
      success: false,
      message: "Must contain sub or sid claim",
    });

    // Unknown issuer
    const p4 = Buffer.from(
      JSON.stringify({
        iss: "https://unknown.issuer.org",
        sub: "user-1",
        events: { "http://schemas.openid.net/event/backchannel-logout": {} },
      }),
    ).toString("base64url");
    expect(await handleBackChannelLogout(`${h1}.${p4}.sig`)).toEqual({
      success: false,
      message: "Unknown issuer",
    });
  });

  it("verifies signed logout token and terminates matching sessions", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" }) as any;
    jwk.kid = "bcl-kid";
    jwk.alg = "RS256";

    const provider: SsoProviderConfig = {
      id: "bcl-prov",
      issuer: "https://id.bcl.test",
      jwksUri: "https://id.bcl.test/jwks",
      clientId: "bcl-client",
      allowedRedirectUris: [],
    };
    registerSsoProvider(provider);

    await setSsoSessionMetadata("bcl-sess-1", {
      provider: "bcl-prov",
      createdAt: "2026-10-18T00:00:00.000Z",
    });

    h.safeFetch.mockImplementation(async (url: string) => {
      if (url.includes(".well-known")) {
        return {
          success: true,
          status: 200,
          body: JSON.stringify({
            jwks_uri: "https://id.bcl.test/jwks",
          }),
          bodyBytes: 100,
          headers: new Headers(),
          error: null,
        };
      }
      if (url.includes("/jwks")) {
        return {
          success: true,
          status: 200,
          body: JSON.stringify({ keys: [jwk] }),
          bodyBytes: 300,
          headers: new Headers(),
          error: null,
        };
      }
      return {
        success: false,
        status: 404,
        body: "",
        bodyBytes: 0,
        headers: new Headers(),
        error: "Not found",
      };
    });

    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "bcl-kid" })).toString(
      "base64url",
    );
    const payload = Buffer.from(
      JSON.stringify({
        iss: "https://id.bcl.test",
        sub: "user-target",
        aud: "bcl-client",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        jti: "bcl-jti-1",
        events: { "http://schemas.openid.net/event/backchannel-logout": {} },
      }),
    ).toString("base64url");
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    const sig = signer.sign(privateKey, "base64url");
    const logoutToken = `${header}.${payload}.${sig}`;

    const res = await handleBackChannelLogout(logoutToken);
    expect(res.success).toBe(true);
    expect(res.message).toContain("1 sessions terminated");
    expect(await getSsoSessionMetadata("bcl-sess-1")).toBeUndefined();
  });

  it("rejects stale iat, a nonce, and a foreign audience", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" }) as any;
    jwk.kid = "bcl-kid-2";
    jwk.alg = "RS256";

    const provider: SsoProviderConfig = {
      ...PROVIDER,
      id: "bcl-tenant-provider",
      jwksUri: "https://id.bcl-tenant.test/jwks",
    };
    registerSsoProvider(provider);

    h.safeFetch.mockImplementation(async (url: string) => {
      if (url.includes(".well-known")) {
        return {
          success: true,
          status: 200,
          body: JSON.stringify({ jwks_uri: provider.jwksUri }),
          bodyBytes: 100,
          headers: new Headers(),
          error: null,
        };
      }
      if (url.includes("/jwks")) {
        return {
          success: true,
          status: 200,
          body: JSON.stringify({ keys: [jwk] }),
          bodyBytes: 300,
          headers: new Headers(),
          error: null,
        };
      }
      return {
        success: false,
        status: 404,
        body: "",
        bodyBytes: 0,
        headers: new Headers(),
        error: "Not found",
      };
    });

    const now = Math.floor(Date.now() / 1000);

    const sign = (overrides: Record<string, unknown> = {}): string => {
      const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "bcl-kid-2" })).toString(
        "base64url",
      );
      const payload = Buffer.from(
        JSON.stringify({
          iss: PROVIDER.issuer,
          sub: "user-1",
          aud: PROVIDER.clientId,
          iat: now,
          exp: now + 300,
          jti: "jti-1",
          events: { "http://schemas.openid.net/event/backchannel-logout": {} },
          ...overrides,
        }),
      ).toString("base64url");
      const data = `${header}.${payload}`;
      const signature = createSign("RSA-SHA256").update(data).sign(privateKey, "base64url");
      return `${data}.${signature}`;
    };

    expect(await handleBackChannelLogout(sign({ iat: now - 3600 }))).toEqual({
      success: false,
      message: "Stale or invalid iat claim",
    });
    expect(await handleBackChannelLogout(sign({ nonce: "n-1" }))).toEqual({
      success: false,
      message: "Logout token must not contain nonce",
    });
    expect(await handleBackChannelLogout(sign({ aud: "other-client" }))).toEqual({
      success: false,
      message: "aud mismatch",
    });

    const accepted = await handleBackChannelLogout(sign());
    expect(accepted.success).toBe(true);
  });
});
