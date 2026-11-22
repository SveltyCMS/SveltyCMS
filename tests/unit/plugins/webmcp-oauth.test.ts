/**
 * @file tests/unit/plugins/webmcp-oauth.test.ts
 * @description OAuth 2.1 client-credentials lifecycle for the WebMCP gateway.
 *
 * Covers token issuance (success, bad secret, unknown/disabled client,
 * disallowed scope, TTL clamp, license gate, no-store), revocation (owned,
 * foreign, unknown, token_hash), the one-time client provisioning helper, and
 * the legacy static `agentApiKey` exchange. The license manager is mocked; the
 * adapter is a stateful in-memory double — no database and no network.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import type { ApiKey, DatabaseId, IDBAdapter, ISODateString } from "@databases/db-interface";
import { generateApiKey } from "@src/databases/auth/api-keys";
import {
  WEBMCP_OAUTH_CLIENT_COLLECTION,
  createWebMcpOAuthClient,
  hashWebMcpClientSecret,
  webmcpTokenName,
  webmcpTokenOwnerId,
  type WebMcpOAuthClientRecord,
} from "@plugins/webmcp/oauth-clients.server";
import {
  handleWebMcpRevokeRequest,
  handleWebMcpTokenRequest,
} from "@plugins/webmcp/oauth-routes.server";
import { parts } from "@plugins/webmcp/index.server";

const licenseMock = vi.fn();
vi.mock("@src/utils/license-manager", () => ({
  checkExtensionLicense: (...args: unknown[]) => licenseMock(...args),
}));

const CLIENT_ID = "wmc_11111111111111111111111111111111";
const OTHER_CLIENT_ID = "wmc_22222222222222222222222222222222";
const CLIENT_SECRET = "test-client-secret-value";
const STATIC_AGENT_KEY = "legacy-static-agent-key-value";
const TENANT = "tenant-a";
const JWT_SECRET = "unit-test-webmcp-jwt-secret-0123456789abcdef";
const ISO_NOW = "2026-11-22T00:00:00.000Z" as ISODateString;

interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface OAuthErrorResponse {
  error: string;
  error_description: string;
}

interface MockState {
  apiKeys: Map<string, ApiKey>;
  clients: Map<string, WebMcpOAuthClientRecord>;
  inserted: Array<{ collection: string; data: Record<string, unknown> }>;
  pluginSettings: Record<string, unknown>;
  pluginStateSettings: Record<string, unknown>;
}

function makeClientRecord(
  overrides: Partial<WebMcpOAuthClientRecord> = {},
): WebMcpOAuthClientRecord {
  return {
    _id: "client-row-1" as DatabaseId,
    allowedScopes: ["webmcp:read", "webmcp:write"],
    clientId: CLIENT_ID,
    createdAt: ISO_NOW,
    disabled: false,
    name: "Test agent",
    secretHash: hashWebMcpClientSecret(CLIENT_SECRET),
    tenantId: TENANT as DatabaseId,
    updatedAt: ISO_NOW,
    ...overrides,
  };
}

function makeState(): MockState {
  return {
    apiKeys: new Map(),
    clients: new Map([[CLIENT_ID, makeClientRecord()]]),
    inserted: [],
    pluginSettings: {},
    pluginStateSettings: {},
  };
}

function buildDb(state: MockState): IDBAdapter {
  let sequence = 0;
  const db = {
    crud: {
      findOne: vi.fn(async (collection: string, query: Record<string, unknown>) => {
        if (collection === WEBMCP_OAUTH_CLIENT_COLLECTION) {
          const client = state.clients.get(String(query.clientId));
          return { success: true, data: client ?? null };
        }
        if (collection === "pluginStates") {
          return {
            success: true,
            data: {
              _id: "webmcp-state",
              pluginId: "webmcp",
              tenantId: String(query.tenantId ?? "default"),
              enabled: true,
              settings: state.pluginStateSettings,
              createdAt: ISO_NOW,
              updatedAt: ISO_NOW,
            },
          };
        }
        if (collection === "plugin_settings") {
          return {
            success: true,
            data: { settings: state.pluginSettings },
          };
        }
        return { success: true, data: null };
      }),
      insert: vi.fn(async (collection: string, data: Record<string, unknown>) => {
        state.inserted.push({ collection, data });
        return {
          success: true,
          data: {
            ...data,
            _id: `inserted-${++sequence}`,
            createdAt: ISO_NOW,
            updatedAt: ISO_NOW,
          },
        };
      }),
    },
    auth: {
      createApiKey: vi.fn(async (data: Partial<ApiKey>) => {
        const row = {
          ...data,
          _id: `api-key-${++sequence}`,
        } as ApiKey;
        if (data.hash) state.apiKeys.set(data.hash, row);
        return { success: true, data: row };
      }),
      getApiKey: vi.fn(async (hash: string) => ({
        success: true,
        data: state.apiKeys.get(hash) ?? null,
      })),
      revokeApiKey: vi.fn(async (id: DatabaseId) => {
        for (const row of state.apiKeys.values()) {
          if (row._id === id) row.revoked = true;
        }
        return { success: true, data: undefined };
      }),
    },
  };
  return db as unknown as IDBAdapter;
}

function makeEvent(
  db: IDBAdapter,
  body: Record<string, string>,
  options: { contentType?: "form" | "json"; tenantId?: string | null } = {},
): RequestEvent {
  const contentType = options.contentType ?? "form";
  const request = new Request("http://localhost/api/webmcp/oauth/token", {
    method: "POST",
    headers: {
      "content-type":
        contentType === "json" ? "application/json" : "application/x-www-form-urlencoded",
    },
    body: contentType === "json" ? JSON.stringify(body) : new URLSearchParams(body).toString(),
  });

  return {
    request,
    locals: { dbAdapter: db, tenantId: (options.tenantId ?? null) as DatabaseId | null },
  } as unknown as RequestEvent;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function storeToken(
  state: MockState,
  clientId: string,
  tenantId: string,
): { full: string; hash: string } {
  const { full, prefix, hash } = generateApiKey();
  state.apiKeys.set(hash, {
    _id: `api-key-token-${clientId}` as DatabaseId,
    name: webmcpTokenName(clientId),
    hash,
    prefix,
    userId: webmcpTokenOwnerId(clientId),
    permissions: [],
    scopes: ["webmcp:read"],
    revoked: false,
    tenantId: tenantId as DatabaseId,
    usageCount: 0,
    createdAt: ISO_NOW,
  });
  return { full, hash };
}

describe("WebMCP OAuth client credentials", () => {
  let state: MockState;
  let db: IDBAdapter;

  it("registers the OAuth and MCP POST routes as public plugin routes", () => {
    const routePart = parts.find((part) => part.type === "route");
    if (!routePart || routePart.type !== "route") throw new Error("route part is missing");

    expect(routePart.routes.map((route) => `${route.method} ${route.path}`)).toEqual([
      "POST /api/webmcp/oauth/token",
      "POST /api/webmcp/oauth/revoke",
      "POST /api/webmcp/mcp",
    ]);
    for (const route of routePart.routes) {
      expect(route.requiredCapabilities).toBe("public");
    }
  });

  beforeEach(() => {
    (globalThis as { privateEnv?: unknown }).privateEnv = { JWT_SECRET_KEY: JWT_SECRET };
    licenseMock.mockReset();
    licenseMock.mockResolvedValue({ active: true, daysRemaining: 30, hasLicense: true });
    state = makeState();
    db = buildDb(state);
  });

  describe("POST /api/webmcp/oauth/token", () => {
    it("issues a scoped, tenant-bound token with no-store", async () => {
      const response = await handleWebMcpTokenRequest(
        makeEvent(db, {
          grant_type: "client_credentials",
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");

      const body = await readJson<TokenResponse>(response);
      expect(body.access_token).toMatch(/^sck_/);
      expect(body.token_type).toBe("Bearer");
      expect(body.expires_in).toBe(900);
      expect(body.scope).toBe("webmcp:read webmcp:write");

      const call = vi.mocked(db.auth.createApiKey).mock.calls[0];
      const payload = call?.[0];
      const options = call?.[1];
      expect(payload).toBeDefined();
      expect(payload?.tenantId).toBe(TENANT);
      expect(payload?.scopes).toEqual(["webmcp:read", "webmcp:write"]);
      expect(payload?.permissions).toEqual([]);
      expect(payload?.userId).toBe(CLIENT_ID);
      expect(payload?.expiresAt).toBeDefined();
      expect(options?.tenantId).toBe(TENANT);

      // The plaintext client secret and the stored HMAC must never be echoed.
      expect(JSON.stringify(body)).not.toContain(CLIENT_SECRET);
      expect(JSON.stringify(body)).not.toContain(hashWebMcpClientSecret(CLIENT_SECRET));
    });

    it("accepts a JSON body", async () => {
      const response = await handleWebMcpTokenRequest(
        makeEvent(
          db,
          {
            grant_type: "client_credentials",
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            scope: "webmcp:read",
          },
          { contentType: "json" },
        ),
      );

      expect(response.status).toBe(200);
      const body = await readJson<TokenResponse>(response);
      expect(body.scope).toBe("webmcp:read");
      expect(body.access_token).toMatch(/^sck_/);
    });

    it("rejects a bad client secret with invalid_client", async () => {
      const response = await handleWebMcpTokenRequest(
        makeEvent(db, {
          grant_type: "client_credentials",
          client_id: CLIENT_ID,
          client_secret: "wrong-secret",
        }),
      );

      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = await readJson<OAuthErrorResponse>(response);
      expect(body.error).toBe("invalid_client");
      expect(JSON.stringify(body)).not.toContain(CLIENT_SECRET);
      expect(db.auth.createApiKey).not.toHaveBeenCalled();
    });

    it("rejects an unknown client with invalid_client", async () => {
      const response = await handleWebMcpTokenRequest(
        makeEvent(db, {
          grant_type: "client_credentials",
          client_id: "wmc_unknown-client",
          client_secret: CLIENT_SECRET,
        }),
      );

      expect(response.status).toBe(401);
      expect((await readJson<OAuthErrorResponse>(response)).error).toBe("invalid_client");
      expect(db.auth.createApiKey).not.toHaveBeenCalled();
    });

    it("rejects a disabled client", async () => {
      state.clients.set(CLIENT_ID, makeClientRecord({ disabled: true }));

      const response = await handleWebMcpTokenRequest(
        makeEvent(db, {
          grant_type: "client_credentials",
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
      );

      expect(response.status).toBe(401);
      expect((await readJson<OAuthErrorResponse>(response)).error).toBe("invalid_client");
      expect(db.auth.createApiKey).not.toHaveBeenCalled();
    });

    it("rejects a scope outside the client allowlist", async () => {
      const response = await handleWebMcpTokenRequest(
        makeEvent(db, {
          grant_type: "client_credentials",
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          scope: "content:write",
        }),
      );

      expect(response.status).toBe(400);
      expect((await readJson<OAuthErrorResponse>(response)).error).toBe("invalid_scope");
      expect(db.auth.createApiKey).not.toHaveBeenCalled();
    });

    it("clamps expires_in to 60–3600 seconds and defaults to 900", async () => {
      const cases = [
        { input: "1", expected: 60 },
        { input: "120", expected: 120 },
        { input: "99999", expected: 3600 },
        { input: "not-a-number", expected: 900 },
      ];

      for (const testCase of cases) {
        const response = await handleWebMcpTokenRequest(
          makeEvent(db, {
            grant_type: "client_credentials",
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            expires_in: testCase.input,
          }),
        );

        expect(response.status).toBe(200);
        expect((await readJson<TokenResponse>(response)).expires_in).toBe(testCase.expected);
      }
    });

    it("fails closed with 403 when the license is inactive", async () => {
      licenseMock.mockResolvedValue({ active: false, daysRemaining: 0, hasLicense: false });

      const response = await handleWebMcpTokenRequest(
        makeEvent(db, {
          grant_type: "client_credentials",
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
      );

      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect((await readJson<OAuthErrorResponse>(response)).error).toBe("access_denied");
      expect(db.auth.createApiKey).not.toHaveBeenCalled();
    });

    it("rejects a grant type other than client_credentials", async () => {
      const response = await handleWebMcpTokenRequest(
        makeEvent(db, {
          grant_type: "authorization_code",
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
      );

      expect(response.status).toBe(400);
      expect((await readJson<OAuthErrorResponse>(response)).error).toBe("unsupported_grant_type");
    });

    it("keeps the legacy static agentApiKey working as an exchange credential", async () => {
      state.pluginStateSettings = { agentApiKey: STATIC_AGENT_KEY };

      const response = await handleWebMcpTokenRequest(
        makeEvent(
          db,
          {
            grant_type: "client_credentials",
            client_secret: STATIC_AGENT_KEY,
          },
          { tenantId: "default" },
        ),
      );

      expect(response.status).toBe(200);
      const body = await readJson<TokenResponse>(response);
      expect(body.access_token).toMatch(/^sck_/);
      expect(body.scope).toBe("webmcp:read webmcp:write");

      const payload = vi.mocked(db.auth.createApiKey).mock.calls[0]?.[0];
      expect(payload?.tenantId).toBe("default");
      expect(payload?.userId).toBe("webmcp-legacy");
    });

    it("keeps the legacy static agentApiKey working from plugin settings", async () => {
      state.pluginSettings = { agentApiKey: STATIC_AGENT_KEY };

      const response = await handleWebMcpTokenRequest(
        makeEvent(
          db,
          { grant_type: "client_credentials", client_secret: STATIC_AGENT_KEY },
          { tenantId: "default" },
        ),
      );

      expect(response.status).toBe(200);
      expect((await readJson<TokenResponse>(response)).token_type).toBe("Bearer");
    });

    it("rejects a wrong legacy key and an unconfigured legacy path", async () => {
      state.pluginStateSettings = { agentApiKey: STATIC_AGENT_KEY };

      const wrongKey = await handleWebMcpTokenRequest(
        makeEvent(
          db,
          { grant_type: "client_credentials", client_secret: "not-the-static-key" },
          { tenantId: "default" },
        ),
      );
      expect(wrongKey.status).toBe(401);

      state.pluginStateSettings = {};
      const unconfigured = await handleWebMcpTokenRequest(
        makeEvent(
          db,
          { grant_type: "client_credentials", client_secret: STATIC_AGENT_KEY },
          { tenantId: "default" },
        ),
      );
      expect(unconfigured.status).toBe(401);
      expect(db.auth.createApiKey).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/webmcp/oauth/revoke", () => {
    it("revokes a token owned by the authenticated client", async () => {
      const { full, hash } = storeToken(state, CLIENT_ID, TENANT);

      const response = await handleWebMcpRevokeRequest(
        makeEvent(db, {
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          token: full,
        }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const text = await response.text();
      expect(text).toBe("");
      expect(text).not.toContain(full);

      expect(db.auth.revokeApiKey).toHaveBeenCalledTimes(1);
      const revokedId = vi.mocked(db.auth.revokeApiKey).mock.calls[0]?.[0];
      expect(String(revokedId)).toBe(`api-key-token-${CLIENT_ID}`);
      expect(state.apiKeys.get(hash)?.revoked).toBe(true);
    });

    it("accepts a token_hash instead of the plaintext token", async () => {
      const { hash } = storeToken(state, CLIENT_ID, TENANT);

      const response = await handleWebMcpRevokeRequest(
        makeEvent(db, {
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          token_hash: hash,
        }),
      );

      expect(response.status).toBe(200);
      expect(state.apiKeys.get(hash)?.revoked).toBe(true);
    });

    it("leaves another client's token untouched", async () => {
      const { hash } = storeToken(state, OTHER_CLIENT_ID, TENANT);

      const response = await handleWebMcpRevokeRequest(
        makeEvent(db, {
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          token_hash: hash,
        }),
      );

      expect(response.status).toBe(200);
      expect(db.auth.revokeApiKey).not.toHaveBeenCalled();
      expect(state.apiKeys.get(hash)?.revoked).toBe(false);
    });

    it("answers 200 for an unknown token (RFC 7009)", async () => {
      const response = await handleWebMcpRevokeRequest(
        makeEvent(db, {
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          token: `sck_${"A".repeat(64)}`,
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("");
      expect(db.auth.revokeApiKey).not.toHaveBeenCalled();
    });

    it("rejects a bad client secret", async () => {
      const { full, hash } = storeToken(state, CLIENT_ID, TENANT);

      const response = await handleWebMcpRevokeRequest(
        makeEvent(db, {
          client_id: CLIENT_ID,
          client_secret: "wrong-secret",
          token: full,
        }),
      );

      expect(response.status).toBe(401);
      expect((await readJson<OAuthErrorResponse>(response)).error).toBe("invalid_client");
      expect(state.apiKeys.get(hash)?.revoked).toBe(false);
    });

    it("is license-gated", async () => {
      const { full, hash } = storeToken(state, CLIENT_ID, TENANT);
      licenseMock.mockResolvedValue({ active: false, daysRemaining: 0, hasLicense: false });

      const response = await handleWebMcpRevokeRequest(
        makeEvent(db, {
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          token: full,
        }),
      );

      expect(response.status).toBe(403);
      expect(state.apiKeys.get(hash)?.revoked).toBe(false);
    });
  });

  describe("createWebMcpOAuthClient", () => {
    it("returns the secret once and persists only its HMAC", async () => {
      const created = await createWebMcpOAuthClient(db, {
        tenantId: TENANT as DatabaseId,
        name: "CI agent",
        allowedScopes: ["webmcp:read"],
      });

      expect(created.success).toBe(true);
      if (!created.success) throw new Error("client provisioning failed");

      expect(created.data.clientId).toMatch(/^wmc_/);
      expect(created.data.clientSecret.length).toBeGreaterThan(30);
      expect(created.data.allowedScopes).toEqual(["webmcp:read"]);

      expect(state.inserted).toHaveLength(1);
      const inserted = state.inserted[0];
      expect(inserted?.collection).toBe(WEBMCP_OAUTH_CLIENT_COLLECTION);
      expect(inserted?.data.secretHash).toBe(hashWebMcpClientSecret(created.data.clientSecret));
      expect(inserted?.data.secretHash).not.toBe(created.data.clientSecret);
      expect(inserted?.data).not.toHaveProperty("clientSecret");
      expect(inserted?.data.tenantId).toBe(TENANT);
    });

    it("rejects an unknown scope", async () => {
      const created = await createWebMcpOAuthClient(db, {
        tenantId: TENANT as DatabaseId,
        name: "CI agent",
        allowedScopes: ["content:write"],
      });

      expect(created.success).toBe(false);
      if (created.success) throw new Error("expected provisioning to fail");
      expect(created.error.code).toBe("INVALID_SCOPE");
      expect(state.inserted).toHaveLength(0);
    });
  });
});
