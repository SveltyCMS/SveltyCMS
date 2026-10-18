/**
 * @file tests/unit/auth/sso/oidc-jwt-verification.test.ts
 * @description Hardened OIDC JWT verification + tenant-scoped provider registry.
 *
 * ### Features:
 * - expired / not-yet-valid / future-iat tokens are rejected
 * - `aud` / `azp` binding to the configured client id
 * - HMAC (`HS*`) algorithm-confusion attempts are rejected
 * - a `kid`-bearing token never falls back to an unrelated JWKS key
 * - valid RS256 tokens are accepted
 * - the same provider id can be registered independently per tenant
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  constants as cryptoConstants,
  createHmac,
  createSign,
  generateKeyPairSync,
  sign as cryptoSign,
} from "node:crypto";

const h = vi.hoisted(() => ({
  getUntypedSetting: vi.fn(async () => undefined),
  invalidateSettingsCache: vi.fn(),
  validateEgressUrl: vi.fn(async () => ({ ok: true })),
  safeFetch: vi.fn(),
}));

vi.mock("@src/services/core/settings-service", () => ({
  getUntypedSetting: h.getUntypedSetting,
  invalidateSettingsCache: h.invalidateSettingsCache,
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: { system: { preferences: { set: vi.fn(async () => {}) } } },
}));

vi.mock("@src/utils/egress-guard", () => ({
  validateEgressUrl: h.validateEgressUrl,
  safeFetch: h.safeFetch,
}));

import {
  clearSsoProviders,
  getAllSsoProviders,
  getSsoProvider,
  registerSsoProvider,
  verifyJwtWithProviderJwks,
  type SsoProviderConfig,
} from "@src/databases/auth/sso-session";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const JWK = {
  ...(publicKey.export({ format: "jwk" }) as any),
  kid: "rsa-kid-1",
  alg: "RS256",
  use: "sig",
};

let issuerCounter = 0;

function makeProvider(overrides: Partial<SsoProviderConfig> = {}): SsoProviderConfig {
  issuerCounter += 1;
  return {
    id: `oidc-provider-${issuerCounter}`,
    issuer: `https://idp-${issuerCounter}.test`,
    clientId: `client-${issuerCounter}`,
    jwksUri: `https://idp-${issuerCounter}.test/jwks`,
    allowedRedirectUris: [],
    ...overrides,
  };
}

function jwksResponse(keys: unknown[] = [JWK]) {
  return {
    success: true,
    status: 200,
    body: JSON.stringify({ keys }),
    bodyBytes: 200,
    headers: new Headers(),
    error: null,
  };
}

function discoveryResponse(provider: SsoProviderConfig) {
  return {
    success: true,
    status: 200,
    body: JSON.stringify({ jwks_uri: provider.jwksUri }),
    bodyBytes: 100,
    headers: new Headers(),
    error: null,
  };
}

function serveJwks(provider: SsoProviderConfig, keys: unknown[] = [JWK]) {
  h.safeFetch.mockImplementation(async (url: string) => {
    if (url.includes(".well-known")) return discoveryResponse(provider);
    if (url.includes("jwks")) return jwksResponse(keys);
    return {
      success: false,
      status: 404,
      body: "",
      bodyBytes: 0,
      headers: new Headers(),
      error: "Not found",
    };
  });
}

function signRs256(
  provider: SsoProviderConfig,
  headerOverrides: Record<string, unknown> = {},
  payloadOverrides: Record<string, unknown> = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid: "rsa-kid-1", ...headerOverrides };
  const payload = {
    iss: provider.issuer,
    sub: "user-1",
    aud: provider.clientId,
    iat: now,
    exp: now + 300,
    ...payloadOverrides,
  };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = createSign("RSA-SHA256").update(data).sign(privateKey, "base64url");
  return `${data}.${signature}`;
}

beforeEach(() => {
  clearSsoProviders();
  h.safeFetch.mockReset();
  h.validateEgressUrl.mockReset();
  h.validateEgressUrl.mockResolvedValue({ ok: true });
});

describe("verifyJwtWithProviderJwks", () => {
  it("accepts a valid RS256 id_token", async () => {
    const provider = makeProvider();
    registerSsoProvider(provider);
    serveJwks(provider);

    const result = await verifyJwtWithProviderJwks(signRs256(provider), provider);

    expect(result.valid).toBe(true);
    expect(result.payload?.sub).toBe("user-1");
  });

  it("rejects an expired token", async () => {
    const provider = makeProvider();
    registerSsoProvider(provider);
    serveJwks(provider);

    const expired = signRs256(provider, {}, { exp: Math.floor(Date.now() / 1000) - 120 });
    const result = await verifyJwtWithProviderJwks(expired, provider);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("token expired");
  });

  it("rejects a token whose aud does not contain the client id", async () => {
    const provider = makeProvider();
    registerSsoProvider(provider);
    serveJwks(provider);

    const token = signRs256(provider, {}, { aud: "some-other-client" });
    const result = await verifyJwtWithProviderJwks(token, provider);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("aud mismatch");
  });

  it("rejects a mismatched azp when present", async () => {
    const provider = makeProvider();
    registerSsoProvider(provider);
    serveJwks(provider);

    const token = signRs256(provider, {}, { aud: [provider.clientId, "other"], azp: "other" });
    const result = await verifyJwtWithProviderJwks(token, provider);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("azp mismatch");
  });

  it("rejects HS256 even when a client secret is configured", async () => {
    const provider = makeProvider({ clientSecret: "super-secret" });
    registerSsoProvider(provider);

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: provider.issuer,
        aud: provider.clientId,
        iat: now,
        exp: now + 300,
      }),
    ).toString("base64url");
    const data = `${header}.${payload}`;
    const signature = createHmac("sha256", "super-secret").update(data).digest("base64url");

    const result = await verifyJwtWithProviderJwks(`${data}.${signature}`, provider);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Unsupported alg: HS256/);
  });

  it("accepts a valid ES256 token (raw JOSE signature)", async () => {
    const provider = makeProvider();
    registerSsoProvider(provider);

    const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const ecJwk = {
      ...(ec.publicKey.export({ format: "jwk" }) as any),
      kid: "ec-kid-1",
      alg: "ES256",
      use: "sig",
    };
    serveJwks(provider, [ecJwk]);

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: "ec-kid-1" })).toString(
      "base64url",
    );
    const payload = Buffer.from(
      JSON.stringify({
        iss: provider.issuer,
        sub: "ec-user",
        aud: provider.clientId,
        iat: now,
        exp: now + 300,
      }),
    ).toString("base64url");
    const data = `${header}.${payload}`;
    const signature = cryptoSign("SHA256", Buffer.from(data), {
      key: ec.privateKey,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url");

    const result = await verifyJwtWithProviderJwks(`${data}.${signature}`, provider);

    expect(result.valid).toBe(true);
    expect(result.payload?.sub).toBe("ec-user");
  });

  it("accepts a valid PS256 token", async () => {
    const provider = makeProvider();
    registerSsoProvider(provider);

    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const psJwk = {
      ...(rsa.publicKey.export({ format: "jwk" }) as any),
      kid: "ps-kid-1",
      alg: "PS256",
      use: "sig",
    };
    serveJwks(provider, [psJwk]);

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "PS256", kid: "ps-kid-1" })).toString(
      "base64url",
    );
    const payload = Buffer.from(
      JSON.stringify({
        iss: provider.issuer,
        sub: "ps-user",
        aud: provider.clientId,
        iat: now,
        exp: now + 300,
      }),
    ).toString("base64url");
    const data = `${header}.${payload}`;
    const signature = cryptoSign("SHA256", Buffer.from(data), {
      key: rsa.privateKey,
      padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    }).toString("base64url");

    const result = await verifyJwtWithProviderJwks(`${data}.${signature}`, provider);

    expect(result.valid).toBe(true);
    expect(result.payload?.sub).toBe("ps-user");
  });

  it("rejects a kid that is absent from the JWKS instead of falling back", async () => {
    const provider = makeProvider();
    registerSsoProvider(provider);
    serveJwks(provider);

    const token = signRs256(provider, { kid: "attacker-kid" });
    const result = await verifyJwtWithProviderJwks(token, provider);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/No JWK for kid/);
  });

  it("rejects a signature made with a different key", async () => {
    const provider = makeProvider();
    registerSsoProvider(provider);

    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const otherJwk = {
      ...(other.publicKey.export({ format: "jwk" }) as any),
      kid: "rsa-kid-1",
      alg: "RS256",
    };
    serveJwks(provider, [otherJwk]);

    const result = await verifyJwtWithProviderJwks(signRs256(provider), provider);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Signature verification failed");
  });

  it("rejects a token issued in the future (nbf)", async () => {
    const provider = makeProvider();
    registerSsoProvider(provider);
    serveJwks(provider);

    const token = signRs256(provider, {}, { nbf: Math.floor(Date.now() / 1000) + 600 });
    const result = await verifyJwtWithProviderJwks(token, provider);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("token not yet valid");
  });

  it("rejects an iat more than five minutes in the future", async () => {
    const provider = makeProvider();
    registerSsoProvider(provider);
    serveJwks(provider);

    const token = signRs256(provider, {}, { iat: Math.floor(Date.now() / 1000) + 600 });
    const result = await verifyJwtWithProviderJwks(token, provider);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("iat too far in the future");
  });
});

describe("tenant-scoped provider registry", () => {
  it("keeps the same provider id independent per tenant", () => {
    registerSsoProvider(
      {
        id: "shared",
        issuer: "https://tenant-a.example.test",
        clientId: "client-a",
        allowedRedirectUris: [],
      },
      "tenant-a",
    );
    registerSsoProvider(
      {
        id: "shared",
        issuer: "https://tenant-b.example.test",
        clientId: "client-b",
        allowedRedirectUris: [],
      },
      "tenant-b",
    );

    expect(getSsoProvider("shared", "tenant-a")?.issuer).toBe("https://tenant-a.example.test");
    expect(getSsoProvider("shared", "tenant-b")?.issuer).toBe("https://tenant-b.example.test");
    expect(getAllSsoProviders("tenant-a")).toHaveLength(1);
    expect(getAllSsoProviders("tenant-b")).toHaveLength(1);
    expect(getAllSsoProviders("tenant-a")[0].clientId).toBe("client-a");
  });
});
