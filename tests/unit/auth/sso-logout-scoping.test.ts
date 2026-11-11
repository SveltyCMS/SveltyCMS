/**
 * @file tests/unit/auth/sso-logout-scoping.test.ts
 * @description An OP-initiated logout must terminate only the session it names.
 *
 * WHY: both OP-initiated logout paths ignored the session identifier in the
 * logout message. Front-channel iteration matched on issuer alone, and
 * back-channel matched on the provider registration, so a logout for one user
 * signed out every user on the same provider. OIDC Back-Channel Logout 1.0
 * §2.6/§2.7 requires an RP to terminate only the sessions identified by the
 * token's `sid` (or `sub`); unrelated sessions must stay signed in.
 *
 * ### Features:
 * - front-channel: `sid` selects exactly one local session
 * - front-channel: an unmatched `sid` terminates nothing but still returns 200
 * - back-channel: `sub` selects the matching session only
 * - back-channel: `sid` takes precedence over `sub`
 * - back-channel: an unmatched identifier succeeds without terminating anything
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSign, generateKeyPairSync } from "node:crypto";

interface SafeFetchResult {
  success: boolean;
  status: number;
  body: string;
  bodyBytes: number;
  headers: Headers;
  error?: string;
}

const mocks = vi.hoisted(() => ({
  deleteSession: vi.fn(async () => ({ success: true })),
  invalidateSessionCache: vi.fn(),
  safeFetch: vi.fn<(url: string) => Promise<SafeFetchResult>>(),
}));

vi.mock("@src/databases/db", () => ({
  getDb: () => ({ auth: { deleteSession: mocks.deleteSession } }),
}));
vi.mock("@src/hooks/handle-authentication", () => ({
  invalidateSessionCache: mocks.invalidateSessionCache,
}));
vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  },
}));
vi.mock("@src/utils/egress-guard", () => ({
  validateEgressUrl: vi.fn(async () => ({ ok: true })),
  safeFetch: mocks.safeFetch,
}));

import {
  clearSsoProviders,
  getSsoSessionMetadata,
  handleBackChannelLogout,
  handleFrontChannelLogout,
  registerSsoProvider,
  setSsoSessionMetadata,
  type SsoProviderConfig,
} from "@src/databases/auth/sso-session";

const ISSUER = "https://id.scoping.test";
const CLIENT_ID = "scoping-client";
const SESSION_A = "sess-user-a";
const SESSION_B = "sess-user-b";

const PROVIDER: SsoProviderConfig = {
  id: "scoping-op",
  issuer: ISSUER,
  clientId: CLIENT_ID,
  jwksUri: `${ISSUER}/jwks`,
  allowedRedirectUris: [],
};

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const exported = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
const jwk: Record<string, unknown> = { ...exported, kid: "scoping-kid", alg: "RS256" };

let jtiCounter = 0;

/** Signs a logout token shaped like a valid OP back-channel message. */
function signLogoutToken(claims: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "scoping-kid" })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({
      iss: ISSUER,
      aud: CLIENT_ID,
      iat: now,
      exp: now + 300,
      jti: `scoping-jti-${++jtiCounter}`,
      events: { "http://schemas.openid.net/event/backchannel-logout": {} },
      ...claims,
    }),
  ).toString("base64url");
  const data = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(data).sign(privateKey, "base64url");
  return `${data}.${signature}`;
}

/** Two users on the same provider, each with its own OP session/subject. */
async function seedTwoUsers(): Promise<void> {
  await setSsoSessionMetadata(SESSION_A, {
    provider: PROVIDER.id,
    createdAt: "2026-10-18T00:00:00.000Z",
    oidcSid: "op-sid-a",
    oidcSubject: "op-user-a",
  });
  await setSsoSessionMetadata(SESSION_B, {
    provider: PROVIDER.id,
    createdAt: "2026-10-18T00:00:00.000Z",
    oidcSid: "op-sid-b",
    oidcSubject: "op-user-b",
  });
}

describe("front-channel logout scoping", () => {
  beforeEach(async () => {
    clearSsoProviders();
    registerSsoProvider(PROVIDER);
    mocks.deleteSession.mockClear();
    mocks.invalidateSessionCache.mockClear();
    await seedTwoUsers();
  });

  it("terminates only the session whose sid the OP names", async () => {
    const resp = await handleFrontChannelLogout(ISSUER, "op-sid-a");

    expect(resp.status).toBe(200);
    expect(resp.headers.get("Cache-Control")).toBe("no-cache, no-store, must-revalidate");
    expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSession).toHaveBeenCalledWith(SESSION_A, undefined);
    expect(await getSsoSessionMetadata(SESSION_A)).toBeUndefined();
    expect(await getSsoSessionMetadata(SESSION_B)).toBeDefined();
  });

  it("terminates nothing when no session matches the sid", async () => {
    const resp = await handleFrontChannelLogout(ISSUER, "op-sid-unknown");

    expect(resp.status).toBe(200);
    expect(resp.headers.get("Pragma")).toBe("no-cache");
    expect(mocks.deleteSession).not.toHaveBeenCalled();
    expect(await getSsoSessionMetadata(SESSION_A)).toBeDefined();
    expect(await getSsoSessionMetadata(SESSION_B)).toBeDefined();
  });
});

describe("back-channel logout scoping", () => {
  beforeEach(() => {
    clearSsoProviders();
    registerSsoProvider(PROVIDER);
    mocks.deleteSession.mockClear();
    mocks.invalidateSessionCache.mockClear();
    mocks.safeFetch.mockImplementation(async (url: string) => {
      if (url.includes(".well-known")) {
        return {
          success: true,
          status: 200,
          body: JSON.stringify({ jwks_uri: `${ISSUER}/jwks` }),
          bodyBytes: 100,
          headers: new Headers(),
        };
      }
      if (url.includes("/jwks")) {
        return {
          success: true,
          status: 200,
          body: JSON.stringify({ keys: [jwk] }),
          bodyBytes: 300,
          headers: new Headers(),
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
  });

  it("terminates only the session for the token's sub when no sid is present", async () => {
    await seedTwoUsers();

    const result = await handleBackChannelLogout(signLogoutToken({ sub: "op-user-b" }));

    expect(result.success).toBe(true);
    expect(result.message).toContain("1 sessions terminated");
    expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSession).toHaveBeenCalledWith(SESSION_B, undefined);
    expect(await getSsoSessionMetadata(SESSION_B)).toBeUndefined();
    expect(await getSsoSessionMetadata(SESSION_A)).toBeDefined();
  });

  it("prefers sid over sub when the token carries both", async () => {
    await seedTwoUsers();

    const result = await handleBackChannelLogout(
      signLogoutToken({ sid: "op-sid-a", sub: "op-user-b" }),
    );

    expect(result.success).toBe(true);
    expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSession).toHaveBeenCalledWith(SESSION_A, undefined);
    expect(await getSsoSessionMetadata(SESSION_A)).toBeUndefined();
    expect(await getSsoSessionMetadata(SESSION_B)).toBeDefined();
  });

  it("terminates nothing when neither sid nor sub matches", async () => {
    await seedTwoUsers();

    const bySub = await handleBackChannelLogout(signLogoutToken({ sub: "op-user-nobody" }));
    const bySid = await handleBackChannelLogout(signLogoutToken({ sid: "op-sid-nobody" }));

    expect(bySub.success).toBe(true);
    expect(bySub.message).toContain("0 sessions terminated");
    expect(bySid.success).toBe(true);
    expect(bySid.message).toContain("0 sessions terminated");
    expect(mocks.deleteSession).not.toHaveBeenCalled();
    expect(await getSsoSessionMetadata(SESSION_A)).toBeDefined();
    expect(await getSsoSessionMetadata(SESSION_B)).toBeDefined();
  });
});
