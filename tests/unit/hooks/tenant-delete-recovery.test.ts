/**
 * @file tests/unit/hooks/tenant-delete-recovery.test.ts
 * @description Regression tests verifying tenant recovery on warm DELETE/mutation
 * requests to `/api/collections/...` under multi-tenant and demo modes, while
 * keeping fail-closed rejection on truly tenantless bare-domain requests.
 *
 * Features:
 * - Recovers subdomain tenant (e.g. `demo.sveltycms.com` -> `"demo"`) on warm turbo-auth hits when `turboCtx.tenantId` was primed `null`
 * - Recovers `demo_tenant_id` cookie on warm authenticated requests in demo mode
 * - Preserves fail-closed 403 `TENANT_REQUIRED` on tenantless bare-domain hosts in multi-tenant mode
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";

const mockState = vi.hoisted(() => ({
  privateSettings: new Map<string, unknown>(),
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    auth: {
      getSessionTokenData: vi.fn(),
      getUserById: vi.fn(),
    },
  },
  auth: { validateSession: vi.fn(), getUserById: vi.fn() },
  getDbInitPromise: vi.fn(() => Promise.resolve()),
  getDb: vi.fn(),
  isDbConnected: vi.fn(() => true),
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn((key: string) => mockState.privateSettings.get(key)),
  getPublicSettingSync: vi.fn(() => undefined),
}));

vi.mock("$app/environment", () => ({ dev: true, browser: false }));

describe("warm collection DELETE tenant resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.privateSettings.clear();
  });

  it("recovers subdomain tenant on warm DELETE /api/collections/... when turboCtx.tenantId is null", async () => {
    mockState.privateSettings.set("MULTI_TENANT", true);
    mockState.privateSettings.set("DEMO", false);

    const { handleAuthentication, primeSessionMemoryCache, clearAllSessionCaches } =
      await import("@src/hooks/handle-authentication");
    const { getTurboAuthContext } = await import("@src/hooks/handle-turbo-get");
    clearAllSessionCaches();

    primeSessionMemoryCache(
      "sess-demo-sub",
      { _id: "u-admin", email: "rar9@example.com", role: "admin", isAdmin: true } as never,
      null,
      ["pwd"],
      undefined,
      [{ _id: "admin", name: "admin", isAdmin: true }] as never,
    );

    const url = new URL("https://demo.sveltycms.com/api/collections/museums/entry-1");
    const event = {
      url,
      request: new Request(url.toString(), { method: "DELETE" }),
      cookies: {
        get: (name: string) => (name === `__Host-${SESSION_COOKIE_NAME}` ? "sess-demo-sub" : null),
        set: vi.fn(),
        delete: vi.fn(),
      },
      locals: { user: null, tenantId: null } as Record<string, unknown>,
      route: { id: "/api/[...path]" },
      params: {},
      getClientAddress: () => "127.0.0.1",
    };
    const resolve = vi.fn(async () => new Response("deleted", { status: 200 }));

    const res = await handleAuthentication({ event: event as never, resolve });
    expect(res.status).toBe(200);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(event.locals.tenantId).toBe("demo");
    expect(getTurboAuthContext("sess-demo-sub")?.tenantId).toBe("demo");
  });

  it("recovers __Host-demo_tenant_id cookie on warm DELETE when DEMO=true and turboCtx.tenantId is null", async () => {
    mockState.privateSettings.set("MULTI_TENANT", true);
    mockState.privateSettings.set("DEMO", true);

    const { handleAuthentication, primeSessionMemoryCache, clearAllSessionCaches } =
      await import("@src/hooks/handle-authentication");
    clearAllSessionCaches();

    primeSessionMemoryCache(
      "sess-demo-cookie",
      { _id: "u-admin", email: "rar9@example.com", role: "admin", isAdmin: true } as never,
      null,
      ["pwd"],
      undefined,
      [{ _id: "admin", name: "admin", isAdmin: true }] as never,
    );

    const url = new URL("https://demo.sveltycms.com/api/collections/museums/entry-1");
    const event = {
      url,
      request: new Request(url.toString(), { method: "DELETE" }),
      cookies: {
        get: (name: string) => {
          if (name === `__Host-${SESSION_COOKIE_NAME}`) return "sess-demo-cookie";
          if (name === "__Host-demo_tenant_id") return "demo-visitor-uuid-1";
          return null;
        },
        set: vi.fn(),
        delete: vi.fn(),
      },
      locals: { user: null, tenantId: null } as Record<string, unknown>,
      route: { id: "/api/[...path]" },
      params: {},
      getClientAddress: () => "127.0.0.1",
    };
    const resolve = vi.fn(async () => new Response("deleted", { status: 200 }));

    const res = await handleAuthentication({ event: event as never, resolve });
    expect(res.status).toBe(200);
    expect(event.locals.tenantId).toBe("demo-visitor-uuid-1");
  });

  it("still fails closed (403 TENANT_REQUIRED) on bare domain when no tenant resolves", async () => {
    mockState.privateSettings.set("MULTI_TENANT", true);
    mockState.privateSettings.set("DEMO", false);

    const { handleAuthentication, primeSessionMemoryCache, clearAllSessionCaches } =
      await import("@src/hooks/handle-authentication");
    clearAllSessionCaches();

    primeSessionMemoryCache(
      "sess-bare",
      { _id: "u-admin", email: "admin@sveltycms.com", role: "admin", isAdmin: true } as never,
      null,
      ["pwd"],
      undefined,
      [{ _id: "admin", name: "admin", isAdmin: true }] as never,
    );

    const url = new URL("https://sveltycms.com/api/collections/museums/entry-1");
    const event = {
      url,
      request: new Request(url.toString(), { method: "DELETE" }),
      cookies: {
        get: (name: string) => (name === `__Host-${SESSION_COOKIE_NAME}` ? "sess-bare" : null),
        set: vi.fn(),
        delete: vi.fn(),
      },
      locals: { user: null, tenantId: null } as Record<string, unknown>,
      route: { id: "/api/[...path]" },
      params: {},
      getClientAddress: () => "127.0.0.1",
    };
    const resolve = vi.fn(async () => new Response("should not reach", { status: 200 }));

    await expect(handleAuthentication({ event: event as never, resolve })).rejects.toMatchObject({
      status: 403,
      code: "TENANT_REQUIRED",
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("recovers tenantId on warm POST /en/mediagallery?/deleteMedia in multi-tenant mode", async () => {
    mockState.privateSettings.set("MULTI_TENANT", true);
    mockState.privateSettings.set("DEMO", false);

    const { handleAuthentication, primeSessionMemoryCache, clearAllSessionCaches } =
      await import("@src/hooks/handle-authentication");
    clearAllSessionCaches();

    primeSessionMemoryCache(
      "sess-media-del",
      { _id: "u-admin", email: "rar9@example.com", role: "admin", isAdmin: true } as never,
      null,
      ["pwd"],
      undefined,
      [{ _id: "admin", name: "admin", isAdmin: true }] as never,
    );

    const url = new URL("https://demo.sveltycms.com/en/mediagallery?/deleteMedia");
    const event = {
      url,
      request: new Request(url.toString(), { method: "POST" }),
      cookies: {
        get: (name: string) => (name === `__Host-${SESSION_COOKIE_NAME}` ? "sess-media-del" : null),
        set: vi.fn(),
        delete: vi.fn(),
      },
      locals: { user: null, tenantId: null } as Record<string, unknown>,
      route: { id: "/(app)/mediagallery" },
      params: {},
      getClientAddress: () => "127.0.0.1",
    };
    const resolve = vi.fn(async () => new Response("ok", { status: 200 }));

    const res = await handleAuthentication({ event: event as never, resolve });
    expect(res.status).toBe(200);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(event.locals.tenantId).toBe("demo");
    expect(event.locals.dbAdapter).toBeDefined();
  });
});
