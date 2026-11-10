/**
 * @file tests/unit/security/tenant-fail-closed.test.ts
 * @description Fail-closed tenant gate for tenant-REQUIRED request paths outside
 * GraphQL data operations (`assertTenantRequired` / `assertTenantRequiredForApiPath`).
 *
 * Contract under test:
 * - MULTI_TENANT + null tenant on a tenant-required path (collections, content,
 *   webhooks, background jobs, …) → 403 TENANT_REQUIRED. The request must never
 *   reach a handler that would resolve `null` to the DB global scope (isolation)
 *   or to `webhookService`'s literal `"global"` bucket (webhooks).
 * - MULTI_TENANT + a resolved tenant → allowed, unchanged.
 * - Single-tenant mode + null tenant → allowed, unchanged.
 * - The documented *explicit global scope* DB read (`tenantId: null`) in
 *   safe-query stays allowed — the boundary gate must not break it.
 *
 * No database is required: only the cached MULTI_TENANT flag and pure helpers.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@src/databases/config-state", () => ({
  getPrivateEnv: () => (globalThis as any).__privateEnv,
  setPrivateEnv: (env: any) => {
    (globalThis as any).__privateEnv = env;
  },
  loadPrivateConfig: () => Promise.resolve((globalThis as any).__privateEnv),
  clearPrivateConfigCache: () => {},
}));

// The MULTI_TENANT flag is read through the settings cache first, then the
// bootstrap private env. Pin the cache to the test's private env.
vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: (key: string) => (globalThis as any).__privateEnv?.[key],
  getPublicSettingSync: () => undefined,
  getUntypedSetting: async () => undefined,
  getPrivateSetting: async () => undefined,
  loadSettingsCache: () => {},
  invalidateSettingsCache: () => {},
}));

import { isMultiTenantEnabled, resetMultiTenantCache } from "@utils/tenant-isolation.server";
import {
  assertTenantRequired,
  assertTenantRequiredForApiPath,
  isTenantRequiredNamespace,
} from "@utils/security/tenant-required.server";
import { assertTenantContext, resetSafeQueryCache, safeQuery } from "@utils/security/safe-query";

/** Tenant-owned surfaces the gate must cover. */
const TENANT_REQUIRED_PATHS = [
  "collections",
  "virtual-collections",
  "content",
  "content-structure",
  "search",
  "events",
  "widgets",
  "dashboard",
  "plugin-settings",
  "system-jobs",
  "webhooks",
  "system-webhooks",
  "content-sync",
  "content-export",
  "content-import",
  "importer",
  "importers",
  "trash",
] as const;

/** Global/system/auth surfaces that legitimately run without a tenant. */
const GLOBAL_SAFE_PATHS = [
  "system",
  "settings",
  "system-settings",
  "theme",
  "metrics",
  "database",
  "logs",
  "version",
  "health",
  "auth",
  "user",
  "permission",
  "token",
  "website-tokens",
  "api-keys",
  "setup",
  "config",
  "testing",
] as const;

function useMode(multiTenant: boolean) {
  (globalThis as any).__privateEnv = multiTenant ? { MULTI_TENANT: true } : { MULTI_TENANT: false };
  resetMultiTenantCache();
  resetSafeQueryCache();
}

/** Runs `fn` and returns the thrown error (fails the test when nothing throws). */
function thrown(fn: () => void): any {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected the call to throw, but it returned");
}

describe("tenant-required paths fail closed (MULTI_TENANT on)", () => {
  beforeEach(() => {
    useMode(true);
    // Guard against mock drift: the gate must agree with the shared flag.
    expect(isMultiTenantEnabled()).toBe(true);
  });

  it("rejects a null tenant on every tenant-owned namespace with 403 TENANT_REQUIRED", () => {
    for (const namespace of TENANT_REQUIRED_PATHS) {
      expect(isTenantRequiredNamespace(namespace), namespace).toBe(true);
      const err = thrown(() => assertTenantRequired(null, namespace));
      expect(err.status, namespace).toBe(403);
      expect(err.code, namespace).toBe("TENANT_REQUIRED");
      expect(String(err.message), namespace).toContain("Tenant ID required");
    }
  });

  it("treats undefined and empty-string tenants as tenantless (not as a scope decision)", () => {
    for (const tenantId of [undefined, "", null]) {
      const err = thrown(() => assertTenantRequired(tenantId as any, "collections"));
      expect(err.code).toBe("TENANT_REQUIRED");
      expect(err.status).toBe(403);
    }
  });

  it("rejects tenantless /api requests at the path boundary (incl. /api/v1)", () => {
    const cases: Array<[string, string]> = [
      ["GET", "/api/collections"],
      ["GET", "/api/collections/posts"],
      ["POST", "/api/content/refresh"],
      ["POST", "/api/webhooks"],
      ["PUT", "/api/system-webhooks/w1"],
      ["POST", "/api/system-jobs/run"],
      ["GET", "/api/v1/collections/posts"],
    ];
    for (const [method, pathname] of cases) {
      const err = thrown(() => assertTenantRequiredForApiPath(method, pathname, null));
      expect(err.status, `${method} ${pathname}`).toBe(403);
      expect(err.code, `${method} ${pathname}`).toBe("TENANT_REQUIRED");
    }
  });

  it("allows the request once a tenant is resolved", () => {
    for (const namespace of TENANT_REQUIRED_PATHS) {
      expect(() => assertTenantRequired("tenant-a", namespace)).not.toThrow();
    }
    expect(() =>
      assertTenantRequiredForApiPath("GET", "/api/collections/posts", "tenant-a"),
    ).not.toThrow();
  });

  it("does not gate the global/system/auth plane", () => {
    for (const namespace of GLOBAL_SAFE_PATHS) {
      expect(isTenantRequiredNamespace(namespace), namespace).toBe(false);
      expect(() => assertTenantRequired(null, namespace), namespace).not.toThrow();
      expect(
        () => assertTenantRequiredForApiPath("GET", `/api/${namespace}/x`, null),
        namespace,
      ).not.toThrow();
    }
  });

  it("skips CORS preflight and non-API paths", () => {
    expect(() => assertTenantRequiredForApiPath("OPTIONS", "/api/collections", null)).not.toThrow();
    expect(() => assertTenantRequiredForApiPath("GET", "/dashboard", null)).not.toThrow();
    expect(() => assertTenantRequiredForApiPath("GET", "/api", null)).not.toThrow();
  });

  it("only bypasses for the explicit allowGlobal escape hatch", () => {
    expect(() => assertTenantRequired(null, "collections", { allowGlobal: true })).not.toThrow();
    // …and the default stays fail-closed.
    expect(() => assertTenantRequired(null, "collections", {})).toThrow(/Tenant ID required/);
  });

  it("rejects an unknown/empty namespace only when it is not tenant-owned", () => {
    expect(() => assertTenantRequired(null, undefined)).not.toThrow();
    expect(() => assertTenantRequired(null, "")).not.toThrow();
  });
});

describe("webhook fallback path fails closed", () => {
  beforeEach(() => {
    useMode(true);
  });

  it("rejects a tenantless webhook API request before webhookService's 'global' fallback", () => {
    // webhookService resolves `tenantId || "global"` (webhook-service.ts), so a
    // tenantless API request would silently write/read the global webhook bucket.
    // The boundary gate must throw first.
    for (const pathname of ["/api/webhooks", "/api/webhooks/w1/logs", "/api/system-webhooks"]) {
      const err = thrown(() => assertTenantRequiredForApiPath("POST", pathname, null));
      expect(err.code, pathname).toBe("TENANT_REQUIRED");
      expect(err.status, pathname).toBe(403);
    }
    expect(() => assertTenantRequiredForApiPath("POST", "/api/webhooks", "tenant-a")).not.toThrow();
  });
});

describe("single-tenant mode is unchanged", () => {
  beforeEach(() => {
    useMode(false);
    expect(isMultiTenantEnabled()).toBe(false);
  });

  it("allows a tenantless request on a tenant-required path", () => {
    for (const namespace of TENANT_REQUIRED_PATHS) {
      expect(() => assertTenantRequired(null, namespace), namespace).not.toThrow();
    }
    expect(() => assertTenantRequiredForApiPath("GET", "/api/collections", null)).not.toThrow();
    expect(() => assertTenantRequiredForApiPath("POST", "/api/webhooks", null)).not.toThrow();
  });
});

describe("documented explicit global scope read is unchanged", () => {
  beforeEach(() => {
    useMode(true);
    expect(isMultiTenantEnabled()).toBe(true);
  });

  it("keeps allowing tenantId: null in safe-query (rows with tenantId IS NULL)", () => {
    // Boundary gate is request-level only: the DB global scope must keep working
    // (global roles/collections, setup admin visiting public pages).
    expect(() => assertTenantContext({ tenantId: null }, "collections.list")).not.toThrow();
    const scoped = safeQuery({}, null) as { tenantId: string | null; isDeleted: unknown };
    expect(scoped.tenantId).toBeNull();
    expect(scoped.isDeleted).toEqual({ $ne: true });
  });

  it("still rejects a MISSING scope in the DB layer", () => {
    expect(thrown(() => assertTenantContext({}, "collections.list")).code).toBe(
      "TENANT_CONTEXT_MISSING",
    );
    expect(() => safeQuery({ _id: "x" }, undefined)).toThrow(/Security Violation/);
  });

  it("keeps tenant-scoped reads scoped to the caller's tenant", () => {
    const scopedA = safeQuery({}, "tenant-a") as { tenantId: string };
    expect(scopedA.tenantId).toBe("tenant-a");
  });
});
