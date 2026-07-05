/**
 * @file tests/unit/hooks/route-access-audit.test.ts
 * @description Route access audit — verifies protected CMS paths and production backdoor closure.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { PUBLIC_ROUTES, isPublicRoute, isBootstrapRoute } from "@utils/hook-utils";
import {
  applyTestBypassFromRequest,
  isTestOrBenchmarkEnvironment,
} from "@utils/test-bypass.server";

/** CMS routes that MUST require authentication (hooks + page guards). */
const PROTECTED_CMS_ROUTES = [
  "/dashboard",
  "/config",
  "/config/queue",
  "/config/monitor",
  "/config/collectionbuilder",
  "/mediagallery",
  "/user",
  "/en/posts",
  "/admin/tenants",
  "/api/collections/posts",
  "/api/media",
  "/api/graphql",
  "/api/chat",
  "/api/permission/update",
  "/email-previews",
];

/** Routes intentionally public (unregistered users allowed). */
const INTENTIONAL_PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/setup",
  "/api/auth/login",
  "/api/system/health",
  "/api/settings/public",
  "/share/abc123",
  "/api/media/share",
  "/api/preview",
  "/warming-up",
];

describe("Route Access Audit", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("protected CMS routes are not public in production mode", () => {
    for (const path of PROTECTED_CMS_ROUTES) {
      expect(isPublicRoute(path, false)).toBe(false);
      expect(PUBLIC_ROUTES.some((r) => path.startsWith(r))).toBe(false);
    }
  });

  it("intentional public routes remain accessible without session", () => {
    for (const path of INTENTIONAL_PUBLIC_ROUTES) {
      const accessibleWithoutSession = isPublicRoute(path, false) || isBootstrapRoute(path);
      expect(accessibleWithoutSession).toBe(true);
    }
  });

  it("bootstrap routes exclude admin surfaces", () => {
    expect(isBootstrapRoute("/dashboard")).toBe(false);
    expect(isBootstrapRoute("/config/queue")).toBe(false);
    expect(isBootstrapRoute("/api/collections")).toBe(false);
    expect(isBootstrapRoute("/login")).toBe(true);
    expect(isBootstrapRoute("/api/system/health")).toBe(true);
  });

  describe("Production backdoor closure", () => {
    beforeEach(() => {
      delete process.env.TEST_MODE;
      delete process.env.VITE_TEST_MODE;
      delete process.env.PLAYWRIGHT_TEST;
      delete process.env.BENCHMARK;
      delete process.env.SVELTY_BENCHMARK_SUITE;
      delete process.env.TEST_API_SECRET;
    });

    it("isTestOrBenchmarkEnvironment is false without env flags", () => {
      expect(isTestOrBenchmarkEnvironment()).toBe(false);
    });

    it("rejects known hardcoded test secret in production", () => {
      const locals = {} as App.Locals;
      const request = new Request("http://localhost/api/collections", {
        headers: { "x-test-secret": "SVELTYCMS_TEST_SECRET_2026" },
      });
      expect(applyTestBypassFromRequest(request, locals)).toBe(false);
      expect(locals.user).toBeUndefined();
    });

    it("rejects arbitrary test secret in production", () => {
      const locals = {} as App.Locals;
      const request = new Request("http://localhost/dashboard", {
        headers: { "x-test-secret": "any-secret" },
      });
      expect(applyTestBypassFromRequest(request, locals)).toBe(false);
    });

    it("allows bypass only when TEST_MODE and valid secret are both set", () => {
      process.env.TEST_MODE = "true";
      process.env.TEST_API_SECRET = "audit-secret-2026";

      const locals = {} as App.Locals;
      const request = new Request("http://localhost/api/collections", {
        headers: { "x-test-secret": "audit-secret-2026" },
      });
      expect(applyTestBypassFromRequest(request, locals)).toBe(true);
      expect(locals.user?.isAdmin).toBe(true);
    });
  });
});
