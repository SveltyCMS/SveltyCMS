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

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { waitForServer, cleanupTestDatabase, getApiBaseUrl } from "../helpers/server";
import { prepareAuthenticatedContext, testFixtures } from "../helpers/test-setup";

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

function extractTitles(body: any): string[] {
  const items = body?.data?.items || body?.data || body?.items || body || [];
  const arr = Array.isArray(items) ? items : [];
  return arr.map((i: any) => i?.title).filter(Boolean);
}

describe("Tenant isolation (A vs B) — authenticated HTTP", () => {
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
      expect(res.ok || res.status === 533).toBe(true);
    }
  });

  it("authenticated list as B never returns tenant A marker", async () => {
    const marker = `iso-marker-${Date.now()}`;
    const entryId = `iso_${Date.now()}`;

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
    // Auth required path must not be 401 with valid admin cookie
    expect(listB.status).not.toBe(401);
    expect(listB.status).toBe(200);
    const bodyB = await listB.json().catch(() => ({}));
    expect(extractTitles(bodyB)).not.toContain(marker);

    const listA = await fetch(
      `${API}/api/collections/${COLLECTION}?limit=100&publicationFilter=all`,
      {
        headers: tenantHeaders(TENANT_A, adminCookie),
      },
    );
    expect(listA.status).not.toBe(401);
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
    expect(resB.status).toBe(200);
    // Sanity: fixtures still valid
    expect(testFixtures.adminUser.email).toContain("@");
  });
});
