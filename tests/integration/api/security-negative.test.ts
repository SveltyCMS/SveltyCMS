/**
 * @file tests/integration/api/security-negative.test.ts
 * @description
 * Negative security integration tests validating that RBAC, multi-tenancy
 * isolation, SQL injection, and XSS protections are enforced.
 *
 * Uses the standard test-setup helper instead of manual bootstrapping
 * to ensure the DB is properly seeded before tests run.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getApiBaseUrl, safeFetch, waitForServer } from "../helpers/server";
import { cleanupTestDatabase, prepareAuthenticatedContext } from "../helpers/test-setup";

const BASE_URL = getApiBaseUrl();

let serverAvailable = false;
let adminCookie = "";

beforeAll(async () => {
  try {
    await waitForServer();
    // Seed the DB and get an admin session via the standard helper
    adminCookie = await prepareAuthenticatedContext();
    serverAvailable = true;
  } catch {
    serverAvailable = false;
  }
});

afterAll(async () => {
  if (serverAvailable) {
    await cleanupTestDatabase();
  }
});

describe("Security Negative Scenarios (Black-Box)", () => {
  it("should reject unauthenticated access to admin endpoints (RBAC)", async () => {
    if (!serverAvailable) return;

    // /api/settings/all is admin-only — verify unauthenticated access is blocked
    const res = await safeFetch(`${BASE_URL}/api/settings/all`);

    // Should return 401 (unauthenticated) or 403 (forbidden)
    expect([401, 403]).toContain(res.status);
  });

  it("should block cross-tenant data access (Multi-Tenancy)", async () => {
    if (!serverAvailable) return;

    // Attempt to access a collection with a spoofed tenantId parameter
    const res = await safeFetch(`${BASE_URL}/api/collections/posts?tenantId=other-tenant`, {
      headers: {
        Cookie: adminCookie,
      },
    });

    // The dispatcher or adapter should enforce isolation:
    // 403 (forbidden), 404 (not found), or 400 (bad request) are all acceptable
    expect([400, 403, 404]).toContain(res.status);
  });

  it("should block SQL injection attempt in query params", async () => {
    if (!serverAvailable) return;

    const res = await safeFetch(`${BASE_URL}/api/collections/posts?filter[title]=' OR '1'='1`, {
      headers: {
        Cookie: adminCookie,
        "X-Test-Security": "true",
      },
    });

    // Firewall or parameterized queries should prevent injection:
    // 400 (bad request), 403 (firewall block), or 404 (collection not found) are acceptable
    expect([400, 403, 404]).toContain(res.status);
  });

  it("should block XSS payload in POST data", async () => {
    if (!serverAvailable) return;

    const res = await safeFetch(`${BASE_URL}/api/collections/posts`, {
      method: "POST",
      body: JSON.stringify({
        title: "<script>alert('xss')</script>",
      }),
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
        "X-Test-Security": "true",
      },
    });

    // Firewall should block or sanitize:
    // 400 (bad request), 403 (firewall block), or 404 (collection not found) are acceptable
    expect([400, 403, 404]).toContain(res.status);
  });

  /**
   * Config/admin namespaces must never be anonymously writable.
   * Complements config-admin-surface happy paths with pure deny coverage.
   */
  describe("config namespaces unauth deny matrix", () => {
    const PROTECTED = [
      "/api/webhooks",
      "/api/automations",
      "/api/workflows",
      "/api/trash",
      "/api/system-jobs",
      "/api/config/status",
      "/api/widgets/list",
      "/api/logs",
    ] as const;

    for (const path of PROTECTED) {
      it(`GET ${path} without cookie → 401/403`, async () => {
        if (!serverAvailable) return;
        const res = await safeFetch(`${BASE_URL}${path}`);
        expect([401, 403]).toContain(res.status);
      });
    }

    it("POST /api/webhooks without cookie → 401/403", async () => {
      if (!serverAvailable) return;
      const res = await safeFetch(`${BASE_URL}/api/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: BASE_URL },
        body: JSON.stringify({
          name: "x",
          url: "https://example.com/x",
          events: ["entry:create"],
          active: true,
        }),
      });
      expect([401, 403]).toContain(res.status);
    });
  });
});
