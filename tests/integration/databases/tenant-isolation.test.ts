/**
 * @file tests/integration/databases/tenant-isolation.test.ts
 * @description
 * Auth'd A vs B tenant isolation against a live preview server.
 *
 * Uses x-test-tenant-id (TEST_MODE) so isolation is exercised without flipping
 * MULTI_TENANT for the whole process. Always provisions a dedicated fixture
 * collection via testing create-collection, then bulk-seeds — never soft-degrades
 * when the seed collection is missing.
 *
 * ### Coverage:
 * - Admin login works with tenant header
 * - create-collection + bulk-seed entry for tenant A (hard-fail on seed errors)
 * - Authenticated collection list as B does not include A's marker
 * - Authenticated list as A includes A's marker
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { waitForServer, cleanupTestDatabase, getApiBaseUrl } from "../helpers/server";
import { prepareAuthenticatedContext, testFixtures } from "../helpers/test-setup";
import { generateUUID } from "@utils/native-utils";

const API = getApiBaseUrl();
const SECRET =
  process.env.TEST_API_SECRET ||
  (globalThis as any).process?.env?.TEST_API_SECRET ||
  "SVELTYCMS_TEST_SECRET_2026";

const TENANT_A = "iso-tenant-a";
const TENANT_B = "iso-tenant-b";
/**
 * Dedicated fixture collection — always provisioned in beforeAll via create-collection.
 * Override with ISO_TEST_COLLECTION only when you intentionally seed a pre-existing schema.
 */
const COLLECTION = process.env.ISO_TEST_COLLECTION || "iso_tenant_fixture";

const FIXTURE_SCHEMA = {
  _id: COLLECTION,
  name: COLLECTION,
  fields: [
    {
      db_fieldName: "title",
      label: "Title",
      widget: { Name: "Input" },
      type: "string",
    },
    {
      db_fieldName: "status",
      label: "Status",
      widget: { Name: "Input" },
      type: "string",
    },
  ],
};

function tenantHeaders(tenant: string, cookie?: string) {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "x-test-secret": SECRET,
    "x-test-mode": "true",
    "x-test-tenant-id": tenant,
    Origin: API,
  };
  if (cookie) h.Cookie = cookie;
  return h;
}

async function testing(action: string, body: Record<string, unknown>, tenant: string) {
  const res = await fetch(`${API}/api/testing`, {
    method: "POST",
    headers: tenantHeaders(tenant),
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

function extractRows(body: any): any[] {
  const items = body?.data?.items || body?.data || body?.items || body || [];
  return Array.isArray(items) ? items : [];
}

function extractTitles(body: any): string[] {
  return extractRows(body)
    .map((i: any) => i?.title)
    .filter(Boolean);
}

/**
 * Explicit DB gate for the whole suite.
 *
 * A live server with no database connection cannot exercise isolation at all, so
 * the suite skips (visibly) instead of failing inside the seed step or, worse,
 * "passing" on an empty fixture. `/api/system/health` answers 533 when the DB is
 * down and 200 + `database:true` when it is usable.
 *
 * The probe MUST resolve before the suite is registered:
 * `tests/integration/**` runs under `bun test` (not Vitest), and Bun reads a second
 * callback parameter as a Node-style *done* callback — `it(..., async (ctx) =>
 * ctx.skip())` therefore waits for a callback that never fires and burns the full
 * 300 s timeout instead of skipping. `describe.skipIf` is Bun-native and reports
 * `(skip)` in the run summary, so the condition is evaluated once here.
 */
const dbReady = await fetch(`${API}/api/system/health`, { signal: AbortSignal.timeout(5_000) })
  .then(async (res) => {
    const body: any = await res.json().catch(() => ({}));
    return res.status === 200 && body?.database !== false;
  })
  .catch(() => false);
if (!dbReady) {
  console.warn(`[tenant-isolation] skipped: database not connected (${API}/api/system/health)`);
}

describe.skipIf(!dbReady)("Tenant isolation (A vs B) — authenticated HTTP", () => {
  let adminCookie = "";

  beforeAll(async () => {
    await waitForServer();
    await cleanupTestDatabase().catch(() => {});
    adminCookie = await prepareAuthenticatedContext();
    expect(adminCookie.length).toBeGreaterThan(0);

    // Force a collection that always exists for both tenants (create-collection is idempotent enough)
    for (const tenant of [TENANT_A, TENANT_B]) {
      const provision = await testing("create-collection", { schema: FIXTURE_SCHEMA }, tenant);
      if (!provision.res.ok) {
        throw new Error(
          `create-collection failed for ${tenant} (${provision.res.status}): ${JSON.stringify(provision.json).slice(0, 300)}`,
        );
      }
      const results = provision.json?.results;
      if (Array.isArray(results) && results.some((r: any) => r.success === false)) {
        throw new Error(
          `create-collection partial failure for ${tenant}: ${JSON.stringify(results).slice(0, 300)}`,
        );
      }
    }
  }, 180_000);

  afterAll(async () => {
    await cleanupTestDatabase().catch(() => {});
  });

  it("health accepts x-test-tenant-id for A and B", async () => {
    for (const t of [TENANT_A, TENANT_B]) {
      const res = await fetch(`${API}/api/system/health`, { headers: tenantHeaders(t) });
      // 200 = healthy, 533 = reachable but DB not connected (api/[...path]).
      // Anything else (401/403/404) means the tenant header was rejected.
      expect([200, 533], `health for ${t}`).toContain(res.status);
    }
  });

  it("authenticated list as B never returns tenant A marker", async () => {
    const marker = `iso-marker-${Date.now()}`;
    const entryId = generateUUID();

    // bulk-seed under tenant A — collection was provisioned in beforeAll
    const seed = await testing(
      "bulk-seed",
      {
        collectionId: COLLECTION,
        data: [
          {
            _id: entryId,
            title: marker,
            status: "publish",
            tenantId: TENANT_A,
          },
        ],
      },
      TENANT_A,
    );

    if (!seed.res.ok) {
      throw new Error(
        `bulk-seed failed (${seed.res.status}): ${JSON.stringify(seed.json).slice(0, 400)}`,
      );
    }

    const listB = await fetch(
      `${API}/api/collections/${COLLECTION}?limit=100&publicationFilter=all`,
      {
        headers: tenantHeaders(TENANT_B, adminCookie),
      },
    );
    // Cross-tenant read: the session was opened for tenant A and now asks for
    // tenant B. Exactly two outcomes are legitimate and BOTH are asserted:
    //   - rejected (401/403) → fail-closed, and the body carries no A data;
    //   - 200 → served strictly inside tenant B, so A's marker is absent and no
    //     returned row is owned by A. Nothing is seeded for B, so B's slice must
    //     be empty.
    // The previous `expect([200, 401])` + assert-only-when-200 shape accepted any
    // leaking 200 body, i.e. it could never fail on a real cross-tenant leak.
    const bodyB = await listB.json().catch(() => ({}));
    if (listB.status === 200) {
      const rowsB = extractRows(bodyB);
      expect(extractTitles(bodyB), "tenant B list leaked tenant A's marker").not.toContain(marker);
      for (const row of rowsB) {
        if (row && typeof row === "object" && "tenantId" in row) {
          expect(row.tenantId, "tenant B list returned a row owned by A").not.toBe(TENANT_A);
        }
      }
      expect(rowsB.length, "tenant B has no fixtures, so its slice must be empty").toBe(0);
    } else {
      expect([401, 403], `cross-tenant list must be rejected, got ${listB.status}`).toContain(
        listB.status,
      );
      expect(extractTitles(bodyB), "rejection body leaked tenant A's marker").not.toContain(marker);
    }

    const listA = await fetch(
      `${API}/api/collections/${COLLECTION}?limit=100&publicationFilter=all`,
      {
        headers: tenantHeaders(TENANT_A, adminCookie),
      },
    );
    expect(listA.status).toBe(200);
    const bodyA = await listA.json().catch(() => ({}));
    const titlesA = extractTitles(bodyA);
    // Marker must be visible to tenant A after successful bulk-seed
    expect(titlesA).toContain(marker);
  });

  it("admin session is reusable across tenant headers", async () => {
    const resA = await fetch(`${API}/api/user?raw=true`, {
      headers: tenantHeaders(TENANT_A, adminCookie),
    });
    const resB = await fetch(`${API}/api/user?raw=true`, {
      headers: tenantHeaders(TENANT_B, adminCookie),
    });
    expect(resA.status).toBe(200);
    // Replaying an A-bound session against tenant B is either answered inside B or
    // rejected fail-closed. Anything else (5xx, redirect, NAMESPACE_FORBIDDEN) is
    // no longer tolerated silently.
    expect([200, 401, 403], `cross-tenant /api/user got ${resB.status}`).toContain(resB.status);
    // Sanity: fixtures still valid
    expect(testFixtures.adminUser.email).toContain("@");
  });
});
