/**
 * @file tests/integration/auth/oidc-live.test.ts
 * @description Zero-mock OIDC integration against a real in-process provider.
 *
 * The SSO helpers are exercised through their production code path: the real
 * `validateEgressUrl`/`safeFetch` pair, a real TCP listener, real HTTP parsing,
 * real PKCE hashing, and real `node:crypto` signature verification. Nothing is
 * stubbed — the provider is a genuine (if minimal) OpenID Provider.
 *
 * The only test-specific affordance is `allowTestEgressOrigin(server.issuer)`,
 * which whitelists the exact ephemeral loopback origin the test started so the
 * production SSRF guard can reach it.
 *
 * ### Coverage
 * - OIDC discovery hydration + document caching
 * - RFC 7636 authorization URL → real `/authorize` redirect → code exchange
 * - JWKS RS256 verification + public-key caching
 * - PKCE mismatch, code replay, unknown code, bad client secret (fail-closed)
 * - Back-channel logout: signed token terminates matching sessions only
 * - Discovery fallback to statically configured endpoints
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { allowTestEgressOrigin, validateEgressUrl } from "@src/utils/egress-guard";
import {
  buildOidcAuthorizationUrl,
  clearSsoProviders,
  discoverOidcConfig,
  exchangeOidcCode,
  generatePkce,
  getSsoSessionMetadata,
  handleBackChannelLogout,
  registerSsoProvider,
  setSsoSessionMetadata,
  verifyJwtWithProviderJwks,
  type SsoProviderConfig,
} from "@src/databases/auth/sso-session";
import { OidcTestServer } from "../helpers/oidc-test-server";

const PROVIDER_ID = "live-oidc";
const REDIRECT_URI = "https://cms.example.test/auth/callback";

let server: OidcTestServer;
let disposeOrigin: () => void;

function provider(overrides: Partial<SsoProviderConfig> = {}): SsoProviderConfig {
  return {
    id: PROVIDER_ID,
    name: "Live OIDC",
    issuer: server.issuer,
    clientId: server.clientId,
    clientSecret: server.clientSecret,
    allowedRedirectUris: [REDIRECT_URI],
    ...overrides,
  };
}

/** Flip one signature bit so signature verification must fail. */
function tamperSignature(jwt: string): string {
  const [header, payload, signature] = jwt.split(".");
  const bytes = Buffer.from(signature, "base64url");
  bytes[0] ^= 0xff;
  return `${header}.${payload}.${bytes.toString("base64url")}`;
}

beforeAll(async () => {
  server = await OidcTestServer.start({ clientId: "cms-client", clientSecret: "cms-secret" });
  disposeOrigin = allowTestEgressOrigin(server.issuer);
});

afterAll(async () => {
  disposeOrigin?.();
  clearSsoProviders();
  await server.close();
});

beforeEach(() => {
  clearSsoProviders();
  registerSsoProvider(provider());
});

describe("egress guard seam", () => {
  it("allows only the registered origin, and blocks loopback again after disposal", async () => {
    await expect(
      validateEgressUrl(`${server.issuer}/.well-known/openid-configuration`, { allowHttp: false }),
    ).resolves.toBeTruthy();

    disposeOrigin();
    try {
      await expect(validateEgressUrl(`${server.issuer}/jwks`, { allowHttp: true })).rejects.toThrow(
        /private|Blocked/i,
      );
    } finally {
      disposeOrigin = allowTestEgressOrigin(server.issuer);
    }

    await expect(validateEgressUrl(server.jwksUri, { allowHttp: false })).resolves.toBeTruthy();
  });
});

describe("OIDC discovery", () => {
  it("hydrates every endpoint from the live provider and caches the document", async () => {
    server.resetRequests();

    const first = await discoverOidcConfig(PROVIDER_ID);
    // NOTE: assert fields individually — Bun's `toMatchObject` writes asymmetric
    // matchers into the *received* object, which would corrupt the cached `ttl`.
    expect(first?.authorizationEndpoint).toBe(server.authorizationEndpoint);
    expect(first?.tokenEndpoint).toBe(server.tokenEndpoint);
    expect(first?.jwksUri).toBe(server.jwksUri);
    expect(first?.endSessionEndpoint).toBe(server.endSessionEndpoint);
    expect(typeof first?.ttl).toBe("number");

    const discoveryRequests = server.countRequests("/.well-known/openid-configuration");
    expect(discoveryRequests).toBe(1);

    const second = await discoverOidcConfig(PROVIDER_ID);
    expect(second).toBe(first);
    expect(second?.tokenEndpoint).toBe(server.tokenEndpoint);
    expect(server.countRequests("/.well-known/openid-configuration")).toBe(discoveryRequests);
  });

  it("falls back to configured endpoints when the provider is unreachable", async () => {
    const deadOrigin = "http://127.0.0.1:1";
    const disposeDead = allowTestEgressOrigin(deadOrigin);

    try {
      clearSsoProviders();
      registerSsoProvider({
        ...provider(),
        id: "dead-op",
        issuer: deadOrigin,
        authorizationEndpoint: `${deadOrigin}/authorize`,
        tokenEndpoint: `${deadOrigin}/token`,
        jwksUri: `${deadOrigin}/jwks`,
        endSessionEndpoint: `${deadOrigin}/logout`,
      });

      const discovered = await discoverOidcConfig("dead-op");
      expect(discovered).toMatchObject({
        authorizationEndpoint: `${deadOrigin}/authorize`,
        tokenEndpoint: `${deadOrigin}/token`,
        jwksUri: `${deadOrigin}/jwks`,
        endSessionEndpoint: `${deadOrigin}/logout`,
      });
    } finally {
      disposeDead();
      clearSsoProviders();
      registerSsoProvider(provider());
    }
  });
});

describe("authorization code flow over real HTTP", () => {
  it("builds an RFC 7636 URL, receives a code, and exchanges it for a verified id_token", async () => {
    const { codeVerifier, codeChallenge } = generatePkce();

    const built = await buildOidcAuthorizationUrl(PROVIDER_ID, {
      redirectUri: REDIRECT_URI,
      state: "state-123",
      nonce: "nonce-123",
      codeChallenge,
      codeChallengeMethod: "S256",
    });
    expect(built.success).toBe(true);
    if (!built.success) return;

    const authorizationUrl = new URL(built.url);
    expect(authorizationUrl.origin).toBe(server.issuer);
    expect(authorizationUrl.pathname).toBe("/authorize");
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizationUrl.searchParams.get("client_id")).toBe(server.clientId);
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(authorizationUrl.searchParams.get("scope")).toBe("openid profile email");
    expect(authorizationUrl.searchParams.get("code_challenge")).toBe(codeChallenge);
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("nonce")).toBe("nonce-123");

    // Real HTTP: the provider answers with a 302 + one-time code.
    const redirect = await fetch(built.url, { redirect: "manual" });
    expect(redirect.status).toBe(302);
    const location = new URL(redirect.headers.get("location") ?? "");
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
    expect(location.searchParams.get("state")).toBe("state-123");

    const code = location.searchParams.get("code") ?? "";
    expect(code).not.toBe("");

    const exchanged = await exchangeOidcCode(PROVIDER_ID, {
      code,
      redirectUri: REDIRECT_URI,
      codeVerifier,
    });
    expect(exchanged.success).toBe(true);
    if (!exchanged.success) return;

    expect(exchanged.idToken).toBeTruthy();
    expect(exchanged.payload).toMatchObject({
      iss: server.issuer,
      sub: server.subject,
      aud: server.clientId,
      nonce: "nonce-123",
    });

    const replay = await exchangeOidcCode(PROVIDER_ID, {
      code,
      redirectUri: REDIRECT_URI,
      codeVerifier,
    });
    expect(replay.success).toBe(false);
    if (!replay.success) expect(replay.message).toMatch(/Token exchange failed: 400/);
  });

  it("fails closed on a PKCE mismatch without consuming the code", async () => {
    const { codeVerifier, codeChallenge } = generatePkce();
    const code = server.issueAuthorizationCode({ redirectUri: REDIRECT_URI, codeChallenge });

    const mismatched = await exchangeOidcCode(PROVIDER_ID, {
      code,
      redirectUri: REDIRECT_URI,
      codeVerifier: generatePkce().codeVerifier,
    });
    expect(mismatched.success).toBe(false);

    const correct = await exchangeOidcCode(PROVIDER_ID, {
      code,
      redirectUri: REDIRECT_URI,
      codeVerifier,
    });
    expect(correct.success).toBe(true);
  });

  it("rejects unknown codes, wrong redirect URIs, and bad client secrets", async () => {
    const unknown = await exchangeOidcCode(PROVIDER_ID, {
      code: "does-not-exist",
      redirectUri: REDIRECT_URI,
    });
    expect(unknown.success).toBe(false);

    const { codeVerifier, codeChallenge } = generatePkce();
    const code = server.issueAuthorizationCode({ redirectUri: REDIRECT_URI, codeChallenge });

    const wrongRedirect = await exchangeOidcCode(PROVIDER_ID, {
      code,
      redirectUri: "https://cms.example.test/other",
      codeVerifier,
    });
    expect(wrongRedirect.success).toBe(false);

    clearSsoProviders();
    registerSsoProvider(provider({ clientSecret: "wrong-secret" }));
    const badSecret = await exchangeOidcCode(PROVIDER_ID, {
      code,
      redirectUri: REDIRECT_URI,
      codeVerifier,
    });
    expect(badSecret.success).toBe(false);
  });
});

describe("JWKS verification", () => {
  it("verifies RS256 tokens and reuses the cached public keys", async () => {
    const first = await verifyJwtWithProviderJwks(
      server.createIdToken({ nonce: "n-1" }),
      provider(),
    );
    expect(first.valid).toBe(true);
    expect(first.payload).toMatchObject({ iss: server.issuer, sub: server.subject });

    const jwksAfterFirst = server.countRequests("/jwks");
    expect(jwksAfterFirst).toBeLessThanOrEqual(1);

    const second = await verifyJwtWithProviderJwks(server.createIdToken({}), provider());
    expect(second.valid).toBe(true);
    expect(server.countRequests("/jwks")).toBe(jwksAfterFirst);
  });

  it("rejects tampered signatures and issuer mismatches", async () => {
    const token = server.createIdToken({});
    const tampered = await verifyJwtWithProviderJwks(tamperSignature(token), provider());
    expect(tampered.valid).toBe(false);
    expect(tampered.reason).toMatch(/Signature|Invalid/i);

    const wrongIssuer = await verifyJwtWithProviderJwks(
      server.createIdToken({ issuer: "https://evil.example.test" }),
      provider(),
    );
    expect(wrongIssuer).toEqual({ valid: false, reason: "iss mismatch" });
  });
});

describe("back-channel logout", () => {
  it("terminates only the sessions owned by the signing provider", async () => {
    await setSsoSessionMetadata(
      "sess-live-1",
      { provider: PROVIDER_ID, createdAt: "2026-01-01T00:00:00.000Z" },
      "global",
    );
    await setSsoSessionMetadata(
      "sess-other",
      { provider: "unrelated-op", createdAt: "2026-01-01T00:00:00.000Z" },
      "global",
    );

    const logoutToken = server.createLogoutToken({
      subject: server.subject,
      sid: "sid-live-1",
      audience: server.clientId,
    });

    const result = await handleBackChannelLogout(logoutToken);
    expect(result.success).toBe(true);
    expect(await getSsoSessionMetadata("sess-live-1", "global")).toBeUndefined();
    expect(await getSsoSessionMetadata("sess-other", "global")).toBeDefined();
  });

  it("rejects missing events, unknown issuers, and tampered signatures", async () => {
    const missingEvents = await handleBackChannelLogout(
      server.createLogoutToken({ includeEvents: false }),
    );
    expect(missingEvents.success).toBe(false);
    expect(missingEvents.message).toMatch(/Missing backchannel-logout event/);

    const unknownIssuer = await handleBackChannelLogout(
      server.createLogoutToken({ issuer: "https://unknown.example.test" }),
    );
    expect(unknownIssuer.success).toBe(false);
    expect(unknownIssuer.message).toBe("Unknown issuer");

    const tampered = await handleBackChannelLogout(
      tamperSignature(server.createLogoutToken({ sid: "sid-x" })),
    );
    expect(tampered.success).toBe(false);
    expect(tampered.message).toMatch(/Invalid logout token/);
  });

  it("rejects stale tokens, a nonce, and a foreign audience (spec §2.6)", async () => {
    const now = Math.floor(Date.now() / 1000);

    const stale = await handleBackChannelLogout(server.createLogoutToken({ iat: now - 3600 }));
    expect(stale).toEqual({ success: false, message: "Stale or invalid iat claim" });

    const withNonce = await handleBackChannelLogout(server.createLogoutToken({ nonce: "nonce-1" }));
    expect(withNonce).toEqual({ success: false, message: "Logout token must not contain nonce" });

    const foreignAudience = await handleBackChannelLogout(
      server.createLogoutToken({ audience: "some-other-client" }),
    );
    expect(foreignAudience).toEqual({ success: false, message: "aud mismatch" });
  });
});
