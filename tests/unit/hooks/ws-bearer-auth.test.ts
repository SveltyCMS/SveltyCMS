/**
 * @file tests/unit/hooks/ws-bearer-auth.test.ts
 * @description Unit tests for resolveBearerTokenForWebSocket (API key and website token resolution).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateApiKey } from "@src/databases/auth/api-keys";
import { resetApiKeyUsageAccumulator } from "@src/databases/auth/api-key-usage-accumulator";
import { dbAdapter } from "@src/databases/db";
import {
  clearAllSessionCaches,
  resolveBearerTokenForWebSocket,
} from "@src/hooks/handle-authentication";
import { hashCredentialSha256HexSync } from "@utils/security/credential-hash";

vi.mock("$app/environment", () => ({
  dev: true,
  browser: false,
}));

vi.mock("@src/databases/db", () => ({
  auth: {
    validateSession: vi.fn(),
  },
  dbAdapter: {
    auth: {
      getApiKey: vi.fn(),
      updateApiKeyUsage: vi.fn().mockResolvedValue({ success: true }),
    },
    system: {
      websiteTokens: {
        getByTokenHash: vi.fn(),
      },
    },
  },
  getDb: vi.fn(),
  getDbInitPromise: vi.fn().mockResolvedValue(null),
  isDbConnected: vi.fn().mockReturnValue(true),
}));

vi.mock("@src/services/metrics/metrics-service", () => ({
  metricsService: {
    incrementAuthValidations: vi.fn(),
    incrementAuthFailures: vi.fn(),
  },
}));

vi.mock("@src/databases/cache/cache-service", () => ({
  SESSION_CACHE_TTL_MS: 86400000,
  cacheService: {
    get: vi.fn().mockResolvedValue(null),
    getSync: vi.fn().mockReturnValue(null),
    setWithCategory: vi.fn().mockResolvedValue(true),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
    isNegativeHit: vi.fn().mockReturnValue(false),
    recordMiss: vi.fn(),
  },
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn((key: string) => {
    if (key === "JWT_SECRET_KEY") return "test-jwt-secret-for-ws-api-key-hmac-32ch";
    return false;
  }),
}));

describe("resolveBearerTokenForWebSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetApiKeyUsageAccumulator();
    clearAllSessionCaches();
  });

  it("authenticates a valid sck_ API key with read scope", async () => {
    const { full, hash, prefix } = generateApiKey();
    vi.mocked(dbAdapter.auth.getApiKey).mockResolvedValueOnce({
      success: true,
      data: {
        _id: "key-ws-1",
        name: "WS Client",
        hash,
        prefix,
        userId: "u-1",
        scopes: ["content:read"],
        permissions: ["read:collection:posts"],
        revoked: false,
        usageCount: 0,
        tenantId: "t1",
        createdAt: "2026-01-01T00:00:00.000Z",
      } as never,
    });

    const resolved = await resolveBearerTokenForWebSocket(full, {
      tenantId: "t1" as never,
      clientIp: "198.51.100.7",
    });

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.user._id).toBe("apikey:key-ws-1");
      expect(resolved.tenantId).toBe("t1");
    }
  });

  it("rejects revoked or write-only sck_ API keys", async () => {
    const { full, hash, prefix } = generateApiKey();
    vi.mocked(dbAdapter.auth.getApiKey).mockResolvedValueOnce({
      success: true,
      data: {
        _id: "key-ws-rev",
        name: "Revoked",
        hash,
        prefix,
        userId: "u-1",
        scopes: ["content:read"],
        permissions: [],
        revoked: true,
        usageCount: 0,
        tenantId: "t1",
        createdAt: "2026-01-01T00:00:00.000Z",
      } as never,
    });

    const revoked = await resolveBearerTokenForWebSocket(full, { tenantId: "t1" as never });
    expect(revoked).toEqual({ ok: false });

    const { full: writeKey, hash: writeHash, prefix: writePrefix } = generateApiKey();
    vi.mocked(dbAdapter.auth.getApiKey).mockResolvedValueOnce({
      success: true,
      data: {
        _id: "key-ws-write",
        name: "WriteOnly",
        hash: writeHash,
        prefix: writePrefix,
        userId: "u-1",
        scopes: ["content:write"],
        permissions: [],
        revoked: false,
        usageCount: 0,
        tenantId: "t1",
        createdAt: "2026-01-01T00:00:00.000Z",
      } as never,
    });

    const writeOnly = await resolveBearerTokenForWebSocket(writeKey, { tenantId: "t1" as never });
    expect(writeOnly).toEqual({ ok: false });
  });

  it("authenticates a valid website token and rejects mismatched tenants", async () => {
    vi.mocked(dbAdapter.system.websiteTokens.getByTokenHash).mockResolvedValueOnce({
      success: true,
      data: {
        _id: "wt-1",
        name: "Frontend Preview",
        token: "preview-secret",
        type: "content-api",
        permissions: ["read:collection:posts"],
        tenantId: "t1",
      } as never,
    });

    const okRes = await resolveBearerTokenForWebSocket("preview-secret", {
      tenantId: "t1" as never,
    });
    expect(okRes.ok).toBe(true);
    expect(dbAdapter.system.websiteTokens.getByTokenHash).toHaveBeenCalledWith(
      hashCredentialSha256HexSync("preview-secret"),
      { tenantId: "t1" },
    );

    vi.mocked(dbAdapter.system.websiteTokens.getByTokenHash).mockResolvedValueOnce({
      success: true,
      data: {
        _id: "wt-1",
        name: "Wrong Tenant",
        token: "preview-secret",
        type: "content-api",
        tenantId: "tenant-other",
      } as never,
    });

    const wrongTenant = await resolveBearerTokenForWebSocket("preview-secret", {
      tenantId: "t1" as never,
    });
    expect(wrongTenant).toEqual({ ok: false });
  });
});
