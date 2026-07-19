/**
 * @file tests/e2e/multi-tenancy/isolation.spec.ts
 * @description
 * Browser-level cross-tenant isolation E2E tests for SveltyCMS.
 *
 * These tests verify that the HTTP API enforces tenant data isolation when
 * MULTI_TENANT mode is enabled:
 * - Tenant A's user CANNOT access Tenant B's content via REST API endpoints
 * - Tenant A's user CANNOT list Tenant B's collections
 * - Tenant A's user CANNOT access Tenant B's media
 * - Same-tenant access works correctly
 * - Global (tenantId: null) resources are shared across tenants
 *
 * ### Test Flow
 * 1. Ensure admin session (via ensureAuthenticated)
 * 2. Create two tenants (A and B) with their own users & content
 * 3. Login as Tenant A user → verify own content accessible
 * 4. Attempt to call Tenant B's API endpoints → verify 403/Forbidden
 * 5. Verify global resources remain shared
 *
 * ### Prerequisites
 * - Playwright dev server must run with MULTI_TENANT=true (skips otherwise)
 * - Use: MULTI_TENANT=true bun run test:e2e
 *
 * @see docs/reference/architecture/multi-tenancy.mdx
 * @see src/hooks/handle-authorization.ts
 * @see src/databases/crud-tenant-guard.ts
 */

import { test, expect } from "@playwright/test";
import { ensureAuthenticated } from "../helpers/test-auth";
import { TEST_API_HEADERS } from "../helpers/test-api";

// ─── Constants ────────────────────────────────────────────────────────────────

// ensureAuthenticated handles admin login with its own credentials from helpers/auth.ts

// Per-run unique identifiers to avoid cross-test collisions
const RUN_ID = Date.now().toString(36);
const TENANT_A_ID = `tenant-a-${RUN_ID}`;
const TENANT_B_ID = `tenant-b-${RUN_ID}`;

// ─── Skip when MULTI_TENANT is not enabled ────────────────────────────────────

const MULTI_TENANT_ENABLED = process.env.MULTI_TENANT === "true";
const skipReason = "Skipped: set MULTI_TENANT=true in webServer env to enable these tests";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** POST to the testing API and return parsed response. */
async function testingApi(page: import("@playwright/test").Page, data: Record<string, unknown>) {
  const resp = await page.request.post("/api/testing", { data });
  const body = await resp.json();
  return { resp, body, status: resp.status() };
}

/** Call a CMS SDK method via the testing API and return the data payload. */
async function sdkCall(page: import("@playwright/test").Page, method: string, args: unknown[]) {
  const { resp, body } = await testingApi(page, {
    action: "sdk-call",
    method,
    args,
  });
  expect(resp.ok()).toBeTruthy();
  expect(body.success).toBe(true);
  return body.data;
}

/** Login a specific user via testing API and apply session to page context. */
async function loginAsUser(page: import("@playwright/test").Page, email: string, password: string) {
  const loginResp = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: { action: "login", email, password },
  });
  expect(loginResp.ok()).toBeTruthy();
  const body = await loginResp.json();
  expect(body.success).toBe(true);
}

/** Create a user for a specific tenant via testing API. */
async function createUser(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
  username: string,
  role: string,
  tenantId: string,
) {
  return sdkCall(page, "auth.createUser", [
    { email, password, username, role, tenantId, isRegistered: true, emailVerified: true },
    {},
  ]);
}

/** Extract items from various API response shapes. */
function extractItems(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.data)) return r.data;
  }
  return [];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Multi-tenancy isolation (HTTP API enforcement)", () => {
  let adminPage: import("@playwright/test").Page;

  // ── Global setup: tenants, users, and seed data ──────────────────────

  test.beforeAll(async ({ browser }) => {
    const adminCtx = await browser.newContext();
    adminPage = await adminCtx.newPage();

    // Step 1: Use ensureAuthenticated to establish an admin session
    await ensureAuthenticated(adminPage);

    // Step 2: Create two tenants
    const tenantA = await sdkCall(adminPage, "db.system.tenants.create", [
      {
        _id: TENANT_A_ID,
        name: `Tenant A ${RUN_ID}`,
        ownerId: "admin",
        status: "active",
        plan: "free",
        quota: {
          maxUsers: 100,
          maxCollections: 50,
          maxStorageBytes: 1073741824,
          maxApiRequestsPerMonth: 50000,
        },
      },
    ]);
    expect(tenantA).toBeTruthy();

    const tenantB = await sdkCall(adminPage, "db.system.tenants.create", [
      {
        _id: TENANT_B_ID,
        name: `Tenant B ${RUN_ID}`,
        ownerId: "admin",
        status: "active",
        plan: "free",
        quota: {
          maxUsers: 100,
          maxCollections: 50,
          maxStorageBytes: 1073741824,
          maxApiRequestsPerMonth: 50000,
        },
      },
    ]);
    expect(tenantB).toBeTruthy();

    // Step 3: Create a user in Tenant A
    await createUser(
      adminPage,
      `user-a-${RUN_ID}@test.com`,
      "Password123!",
      `UserA-${RUN_ID}`,
      "admin",
      TENANT_A_ID,
    );

    // Step 4: Create a user in Tenant B
    await createUser(
      adminPage,
      `user-b-${RUN_ID}@test.com`,
      "Password123!",
      `UserB-${RUN_ID}`,
      "admin",
      TENANT_B_ID,
    );
  });

  // ── Test 1: Cross-tenant collection listing is blocked ───────────────

  test("Test 1: Cross-tenant collection listing is blocked", async () => {
    test.skip(!MULTI_TENANT_ENABLED, skipReason);

    // Step 1: Create tenant-scoped collections via content structure nodes
    const colIdA = `col-a-${RUN_ID}`;
    const colIdB = `col-b-${RUN_ID}`;

    await sdkCall(adminPage, "db.content.nodes.upsertContentStructureNode", [
      {
        _id: colIdA,
        path: `/collection/col-a-${RUN_ID}`,
        name: `Collection A ${RUN_ID}`,
        nodeType: "collection",
        collectionDef: { _id: colIdA, name: `Collection A ${RUN_ID}`, fields: [] },
        status: "publish",
        source: "test",
        tenantId: TENANT_A_ID,
      },
    ]);

    await sdkCall(adminPage, "db.content.nodes.upsertContentStructureNode", [
      {
        _id: colIdB,
        path: `/collection/col-b-${RUN_ID}`,
        name: `Collection B ${RUN_ID}`,
        nodeType: "collection",
        collectionDef: { _id: colIdB, name: `Collection B ${RUN_ID}`, fields: [] },
        status: "publish",
        source: "test",
        tenantId: TENANT_B_ID,
      },
    ]);

    // Step 2: Login as Tenant A user
    await loginAsUser(adminPage, `user-a-${RUN_ID}@test.com`, "Password123!");

    // Step 3: Verify Tenant A can see their own collection via HTTP API
    const ownCollectionResp = await adminPage.request.get(`/api/collections/${colIdA}/entries`);
    expect(ownCollectionResp.ok()).toBeTruthy();

    // Step 4: Attempt to access Tenant B's collection - expect 403
    const otherResp = await adminPage.request.get(`/api/collections/${colIdB}/entries`);
    expect(otherResp.status()).toBe(403);
    const otherBody = await otherResp.json().catch(() => ({}));
    expect(otherBody.error || otherBody.code || otherBody.message).toBeTruthy();
  });

  // ── Test 2: Cross-tenant content entry access is blocked ─────────────

  test("Test 2: Cross-tenant content entry access is blocked", async () => {
    test.skip(!MULTI_TENANT_ENABLED, skipReason);

    const collectionId = `entries-${RUN_ID}`;
    const entryAId = `entry-a-${RUN_ID}`;
    const entryBId = `entry-b-${RUN_ID}`;

    // Step 1: Create a physical collection table (needed for CRUD)
    const { body: createCol } = await testingApi(adminPage, {
      action: "create-collection",
      schema: {
        _id: collectionId,
        name: `Entries ${RUN_ID}`,
        fields: [
          { db_fieldName: "title", name: "Title", widget: { Name: "Input" }, type: "string" },
          { db_fieldName: "body", name: "Body", widget: { Name: "Textarea" }, type: "string" },
        ],
      },
    });
    expect(createCol.success).toBe(true);

    // Step 2: Insert entries for both tenants (using bypassTenantCheck)
    await sdkCall(adminPage, "db.crud.insert", [
      collectionId,
      {
        _id: entryAId,
        title: `Tenant A Secret ${RUN_ID}`,
        body: "Sensitive data for Tenant A only.",
        tenantId: TENANT_A_ID,
        status: "publish",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDeleted: false,
      },
      { bypassTenantCheck: true },
    ]);

    await sdkCall(adminPage, "db.crud.insert", [
      collectionId,
      {
        _id: entryBId,
        title: `Tenant B Secret ${RUN_ID}`,
        body: "Sensitive data for Tenant B only.",
        tenantId: TENANT_B_ID,
        status: "publish",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDeleted: false,
      },
      { bypassTenantCheck: true },
    ]);

    // Step 3: Login as Tenant A user
    await loginAsUser(adminPage, `user-a-${RUN_ID}@test.com`, "Password123!");

    // Step 4: Tenant A can access their own entry
    const ownResp = await adminPage.request.get(
      `/api/collections/${collectionId}/entries/${entryAId}`,
    );
    expect(ownResp.ok()).toBeTruthy();
    const ownBody = await ownResp.json();
    expect(ownBody.data?.title || ownBody.title).toContain("Tenant A Secret");

    // Step 5: Tenant A cannot access Tenant B's entry - expect 403
    const otherResp = await adminPage.request.get(
      `/api/collections/${collectionId}/entries/${entryBId}`,
    );
    expect(otherResp.status()).toBe(403);
  });

  // ── Test 3: Cross-tenant media isolation ─────────────────────────────

  test("Test 3: Cross-tenant media isolation", async () => {
    test.skip(!MULTI_TENANT_ENABLED, skipReason);

    const mediaIdA = `media-a-${RUN_ID}`;
    const mediaIdB = `media-b-${RUN_ID}`;

    // Step 1: Insert media records for each tenant with explicit tenantIds
    await sdkCall(adminPage, "db.crud.insert", [
      "media",
      {
        _id: mediaIdA,
        fileName: `img-a-${RUN_ID}.png`,
        originalName: `img-a-${RUN_ID}.png`,
        mimeType: "image/png",
        size: 2048,
        url: `/media/img-a-${RUN_ID}.png`,
        path: `/media/img-a-${RUN_ID}.png`,
        tenantId: TENANT_A_ID,
        folderId: null,
        thumbnails: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDeleted: false,
      },
      { bypassTenantCheck: true },
    ]);

    await sdkCall(adminPage, "db.crud.insert", [
      "media",
      {
        _id: mediaIdB,
        fileName: `img-b-${RUN_ID}.png`,
        originalName: `img-b-${RUN_ID}.png`,
        mimeType: "image/png",
        size: 4096,
        url: `/media/img-b-${RUN_ID}.png`,
        path: `/media/img-b-${RUN_ID}.png`,
        tenantId: TENANT_B_ID,
        folderId: null,
        thumbnails: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDeleted: false,
      },
      { bypassTenantCheck: true },
    ]);

    // Step 2: Login as Tenant A user
    await loginAsUser(adminPage, `user-a-${RUN_ID}@test.com`, "Password123!");

    // Step 3: Tenant A can find their own media via the media API
    const ownMediaResp = await adminPage.request.get(`/api/media/${mediaIdA}`);
    expect(ownMediaResp.ok()).toBeTruthy();

    // Step 4: Tenant A cannot access Tenant B's media via the media API
    const otherMediaResp = await adminPage.request.get(`/api/media/${mediaIdB}`);
    expect(otherMediaResp.status()).toBe(403);
  });

  // ── Test 4: Same-tenant access works correctly ───────────────────────

  test("Test 4: Same-tenant access works correctly", async () => {
    test.skip(!MULTI_TENANT_ENABLED, skipReason);

    const collectionId = `same-tenant-${RUN_ID}`;
    const entryId = `entry-${RUN_ID}`;

    // Step 1: Create a tenant-scoped collection and entry
    await sdkCall(adminPage, "db.content.nodes.upsertContentStructureNode", [
      {
        _id: collectionId,
        path: `/collection/same-tenant-${RUN_ID}`,
        name: `Same Tenant Collection ${RUN_ID}`,
        nodeType: "collection",
        collectionDef: { _id: collectionId, name: `Same Tenant Collection ${RUN_ID}`, fields: [] },
        status: "publish",
        source: "test",
        tenantId: TENANT_A_ID,
      },
    ]);

    const { body: createCol } = await testingApi(adminPage, {
      action: "create-collection",
      schema: {
        _id: collectionId,
        name: `Same Tenant ${RUN_ID}`,
        fields: [
          { db_fieldName: "title", name: "Title", widget: { Name: "Input" }, type: "string" },
        ],
      },
    });
    expect(createCol.success).toBe(true);

    await sdkCall(adminPage, "db.crud.insert", [
      collectionId,
      {
        _id: entryId,
        title: `Own Entry ${RUN_ID}`,
        tenantId: TENANT_A_ID,
        status: "publish",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDeleted: false,
      },
      { bypassTenantCheck: true },
    ]);

    // Step 2: Login as Tenant A user
    await loginAsUser(adminPage, `user-a-${RUN_ID}@test.com`, "Password123!");

    // Step 3: Can list own collection entries
    const listResp = await adminPage.request.get(`/api/collections/${collectionId}/entries`);
    expect(listResp.ok()).toBeTruthy();
    const listBody = await listResp.json();
    const items = extractItems(listBody);
    expect(items.some((e: any) => (e as Record<string, unknown>)._id === entryId)).toBe(true);

    // Step 4: Can read own entry
    const getResp = await adminPage.request.get(
      `/api/collections/${collectionId}/entries/${entryId}`,
    );
    expect(getResp.ok()).toBeTruthy();
  });

  // ── Test 5: Global (tenantId: null) resources are shared ──────────────

  test("Test 5: Global (tenantId: null) resources are shared", async () => {
    test.skip(!MULTI_TENANT_ENABLED, skipReason);

    const globalCollectionId = `global-entries-${RUN_ID}`;
    const globalEntryId = `global-entry-${RUN_ID}`;

    // Step 1: Create the physical collection table
    const { body: createCol } = await testingApi(adminPage, {
      action: "create-collection",
      schema: {
        _id: globalCollectionId,
        name: `Global Entries ${RUN_ID}`,
        fields: [
          { db_fieldName: "title", name: "Title", widget: { Name: "Input" }, type: "string" },
        ],
      },
    });
    expect(createCol.success).toBe(true);

    // Step 2: Insert a global entry (tenantId: null)
    await sdkCall(adminPage, "db.crud.insert", [
      globalCollectionId,
      {
        _id: globalEntryId,
        title: `Global Shared Resource ${RUN_ID}`,
        tenantId: null,
        status: "publish",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDeleted: false,
      },
      { bypassTenantCheck: true },
    ]);

    // Step 3: Login as Tenant A user and verify global resource accessible
    await loginAsUser(adminPage, `user-a-${RUN_ID}@test.com`, "Password123!");
    const tenantAResp = await adminPage.request.get(
      `/api/collections/${globalCollectionId}/entries/${globalEntryId}`,
    );
    expect(tenantAResp.ok()).toBeTruthy();

    // Step 4: Login as Tenant B user and verify same global resource accessible
    await loginAsUser(adminPage, `user-b-${RUN_ID}@test.com`, "Password123!");
    const tenantBResp = await adminPage.request.get(
      `/api/collections/${globalCollectionId}/entries/${globalEntryId}`,
    );
    expect(tenantBResp.ok()).toBeTruthy();
  });
});
