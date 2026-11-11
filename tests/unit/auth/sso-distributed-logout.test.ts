/**
 * @file tests/unit/auth/sso-distributed-logout.test.ts
 * @description An IdP logout that lands on a node other than the one that
 * handled the login must still terminate the session.
 *
 * WHY: every OP/SAML-initiated logout path iterated the process-local
 * `ssoSessionMetadata` map. The metadata was also written to the shared cache,
 * but only by session id — a logout message carries no such id, so a second
 * node had no way to enumerate candidates and the session stayed alive until it
 * expired. This suite models the second node by clearing the local map while
 * keeping the shared cache, which is exactly the state of an instance that
 * never served the login.
 *
 * ### Features:
 * - front-channel: `sid` resolves through the distributed index
 * - back-channel: `sub` fallback resolves through the distributed index
 * - SAML: `NameID` resolves through the distributed index
 * - two users, multiple sessions per user, two tenants sharing a provider id
 * - index buckets are pruned when a session is terminated
 * - an unavailable cache degrades to the local map instead of throwing
 */

import { createSign, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface SafeFetchResult {
  success: boolean;
  status: number;
  body: string;
  bodyBytes: number;
  headers: Headers;
  error?: string;
}

const h = vi.hoisted(() => {
  /** Shared cache: one tenant-namespaced map, standing in for Redis/L2. */
  const store = new Map<string, unknown>();
  const fullKey = (key: string, tenantId?: string | null) =>
    `tenant:${!tenantId || tenantId === "default" ? "default" : tenantId}:${key}`;
  return {
    store,
    fullKey,
    deleteSession: vi.fn(async () => ({ success: true })),
    invalidateSessionCache: vi.fn(),
    safeFetch: vi.fn<(url: string) => Promise<SafeFetchResult>>(),
    cacheDown: { value: false },
  };
});

vi.mock("@src/databases/db", () => ({
  getDb: () => ({ auth: { deleteSession: h.deleteSession } }),
}));
vi.mock("@src/hooks/handle-authentication", () => ({
  invalidateSessionCache: h.invalidateSessionCache,
}));
vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    get: async (key: string, tenantId?: string | null) => {
      if (h.cacheDown.value) throw new Error("cache unavailable");
      return h.store.get(h.fullKey(key, tenantId)) ?? null;
    },
    set: async (key: string, value: unknown, _ttl?: number, tenantId?: string | null) => {
      if (h.cacheDown.value) throw new Error("cache unavailable");
      h.store.set(h.fullKey(key, tenantId), value);
    },
    delete: async (key: string, tenantId?: string | null) => {
      if (h.cacheDown.value) throw new Error("cache unavailable");
      return h.store.delete(h.fullKey(key, tenantId));
    },
    getMany: async <T>(keys: string[], tenantId?: string | null): Promise<(T | null)[]> => {
      if (h.cacheDown.value) throw new Error("cache unavailable");
      return keys.map((key) => (h.store.get(h.fullKey(key, tenantId)) as T) ?? null);
    },
  },
}));
vi.mock("@src/utils/egress-guard", () => ({
  validateEgressUrl: vi.fn(async () => ({ ok: true })),
  safeFetch: h.safeFetch,
}));

import {
  clearSsoProviders,
  findSamlSessions,
  getSsoSessionMetadata,
  handleBackChannelLogout,
  handleFrontChannelLogout,
  registerSsoProvider,
  resetSsoSessions,
  setSsoSessionMetadata,
  terminateSessionAndMetadata,
  type SsoProviderConfig,
} from "@src/databases/auth/sso-session";

const ISSUER = "https://id.distributed.test";
const CLIENT_ID = "distributed-client";

const PROVIDER: SsoProviderConfig = {
  id: "distributed-op",
  issuer: ISSUER,
  clientId: CLIENT_ID,
  jwksUri: `${ISSUER}/jwks`,
  allowedRedirectUris: [],
};

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk: Record<string, unknown> = {
  ...(publicKey.export({ format: "jwk" }) as Record<string, unknown>),
  kid: "distributed-kid",
  alg: "RS256",
};

let jti = 0;

function signLogoutToken(claims: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "distributed-kid" })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({
      iss: ISSUER,
      aud: CLIENT_ID,
      iat: now,
      exp: now + 300,
      jti: `distributed-jti-${++jti}`,
      events: { "http://schemas.openid.net/event/backchannel-logout": {} },
      ...claims,
    }),
  ).toString("base64url");
  const data = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(data).sign(privateKey, "base64url");
  return `${data}.${signature}`;
}

async function seedOidcSession(
  sessionId: string,
  claims: { sid?: string; sub?: string },
  tenantId?: string,
): Promise<void> {
  await setSsoSessionMetadata(
    sessionId,
    {
      provider: PROVIDER.id,
      createdAt: "2026-11-11T00:00:00.000Z",
      ...(claims.sid ? { oidcSid: claims.sid } : {}),
      ...(claims.sub ? { oidcSubject: claims.sub } : {}),
      ...(tenantId ? { tenantId } : {}),
    },
    tenantId,
  );
}

/** Model a second application instance: shared cache intact, local map empty. */
function moveToAnotherNode(): void {
  resetSsoSessions();
}

const indexKey = (kind: string, value: string) =>
  h.fullKey(`sso:index:${kind}:${encodeURIComponent(value)}`, "global");

describe("extended SSO logout index", () => {
  beforeEach(() => {
    clearSsoProviders();
    resetSsoSessions();
    h.store.clear();
    h.cacheDown.value = false;
    h.deleteSession.mockClear();
    h.invalidateSessionCache.mockClear();
    h.safeFetch.mockImplementation(async (url: string) => {
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

  it("indexes every external identifier at login", async () => {
    registerSsoProvider(PROVIDER);
    await seedOidcSession("sess-index", { sid: "op-sid-index", sub: "op-user-index" });

    expect(h.store.get(indexKey("sid", "op-sid-index"))).toEqual(["sess-index"]);
    expect(h.store.get(indexKey("sub", "op-user-index"))).toEqual(["sess-index"]);
    expect(h.store.get(h.fullKey("sso:directory:sess-index", "global"))).toMatchObject({
      provider: PROVIDER.id,
    });
  });

  it("terminates the named session when the front-channel logout hits another node", async () => {
    registerSsoProvider(PROVIDER);
    await seedOidcSession("sess-a", { sid: "op-sid-a", sub: "op-user-a" });
    await seedOidcSession("sess-b", { sid: "op-sid-b", sub: "op-user-b" });
    moveToAnotherNode();

    const response = await handleFrontChannelLogout(ISSUER, "op-sid-a");

    expect(response.status).toBe(200);
    expect(h.deleteSession).toHaveBeenCalledTimes(1);
    expect(h.deleteSession).toHaveBeenCalledWith("sess-a", undefined);
  });

  it("terminates by sub across nodes and leaves the other user signed in", async () => {
    registerSsoProvider(PROVIDER);
    await seedOidcSession("sess-a", { sid: "op-sid-a", sub: "op-user-a" });
    await seedOidcSession("sess-b", { sid: "op-sid-b", sub: "op-user-b" });
    moveToAnotherNode();

    const result = await handleBackChannelLogout(signLogoutToken({ sub: "op-user-b" }));

    expect(result.success).toBe(true);
    expect(result.message).toContain("1 sessions terminated");
    expect(h.deleteSession).toHaveBeenCalledWith("sess-b", undefined);
    expect(h.deleteSession).toHaveBeenCalledTimes(1);
  });

  it("terminates every session of the same user when the token names the sub", async () => {
    registerSsoProvider(PROVIDER);
    await seedOidcSession("sess-a1", { sid: "op-sid-a1", sub: "op-user-a" });
    await seedOidcSession("sess-a2", { sid: "op-sid-a2", sub: "op-user-a" });
    moveToAnotherNode();

    const result = await handleBackChannelLogout(signLogoutToken({ sub: "op-user-a" }));

    expect(result.success).toBe(true);
    expect(result.message).toContain("2 sessions terminated");
    expect(h.deleteSession).toHaveBeenCalledTimes(2);
  });

  it("does not terminate a same-id provider belonging to another tenant", async () => {
    const tenantProvider: SsoProviderConfig = { ...PROVIDER };
    registerSsoProvider(PROVIDER);
    registerSsoProvider(tenantProvider, "tenant-b");
    await seedOidcSession("sess-a", { sid: "op-sid-a", sub: "op-user-a" });
    await seedOidcSession("sess-b", { sid: "op-sid-b", sub: "op-user-b" }, "tenant-b");
    moveToAnotherNode();

    const result = await handleBackChannelLogout(signLogoutToken({ sid: "op-sid-b" }), "tenant-b");

    expect(result.success).toBe(true);
    // The tenant registration, not the global one, is the match.
    expect(h.deleteSession).toHaveBeenCalledWith("sess-b", { tenantId: "tenant-b" });
    expect(h.deleteSession).toHaveBeenCalledTimes(1);
  });

  it("resolves a SAML NameID across nodes", async () => {
    await setSsoSessionMetadata("sess-saml", {
      provider: "saml",
      createdAt: "2026-11-11T00:00:00.000Z",
      samlNameId: "user@example.test",
      samlSessionIndex: "_saml-index-1",
    });
    moveToAnotherNode();

    const matches = await findSamlSessions("user@example.test", "_saml-index-1");

    expect(matches).toHaveLength(1);
    expect(matches[0].sessionId).toBe("sess-saml");
  });

  it("prunes the index bucket when a session is terminated", async () => {
    registerSsoProvider(PROVIDER);
    await seedOidcSession("sess-a", { sid: "op-sid-a", sub: "op-user-a" });

    await terminateSessionAndMetadata("sess-a");

    expect(h.store.get(indexKey("sid", "op-sid-a"))).toEqual([]);
    expect(h.store.get(indexKey("sub", "op-user-a"))).toEqual([]);
    expect(await getSsoSessionMetadata("sess-a")).toBeUndefined();
  });

  it("falls back to the local map when the shared cache is unavailable", async () => {
    registerSsoProvider(PROVIDER);
    await seedOidcSession("sess-a", { sid: "op-sid-a", sub: "op-user-a" });
    h.cacheDown.value = true;

    const response = await handleFrontChannelLogout(ISSUER, "op-sid-a");

    expect(response.status).toBe(200);
    expect(h.deleteSession).toHaveBeenCalledWith("sess-a", undefined);
  });
});
