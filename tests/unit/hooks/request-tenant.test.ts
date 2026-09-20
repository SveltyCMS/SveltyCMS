/**
 * @file tests/unit/hooks/request-tenant.test.ts
 * @description Tenant resolution for turbo fast paths.
 *
 * Turbo paths hydrate `locals` from a session-keyed auth cache, so the tenant
 * they carry belongs to whoever resolved the session first. Every turbo path
 * must re-apply the per-request override or a single session crosses tenants.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveRequestTenant } from "@src/hooks/request-tenant";
import type { DatabaseId } from "@src/content/types";

const SESSION_TENANT = "session-tenant" as DatabaseId;

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/collections/posts", { headers });
}

describe("resolveRequestTenant", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers the test-mode header over the session tenant", () => {
    vi.stubEnv("TEST_MODE", "true");
    expect(resolveRequestTenant(req({ "x-test-tenant-id": "tenant-b" }), SESSION_TENANT)).toBe(
      "tenant-b",
    );
  });

  it("accepts x-tenant-id as an alias in test mode", () => {
    vi.stubEnv("TEST_MODE", "true");
    expect(resolveRequestTenant(req({ "x-tenant-id": "tenant-c" }), SESSION_TENANT)).toBe(
      "tenant-c",
    );
  });

  it("ignores the header outside test mode", () => {
    vi.stubEnv("TEST_MODE", "");
    vi.stubEnv("PLAYWRIGHT_TEST", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveRequestTenant(req({ "x-test-tenant-id": "tenant-b" }), SESSION_TENANT)).toBe(
      SESSION_TENANT,
    );
  });

  it("rejects the literal null and non-slug values", () => {
    vi.stubEnv("TEST_MODE", "true");
    for (const value of ["null", "a/b", " ", "a b", "tenant;drop"]) {
      expect(resolveRequestTenant(req({ "x-test-tenant-id": value }), SESSION_TENANT)).toBe(
        SESSION_TENANT,
      );
    }
  });

  it("falls back to null when neither source has a tenant", () => {
    vi.stubEnv("TEST_MODE", "true");
    expect(resolveRequestTenant(req(), null)).toBeNull();
  });
});
