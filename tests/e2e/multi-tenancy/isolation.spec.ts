/**
 * @file tests/e2e/multi-tenancy/isolation.spec.ts
 * @description
 * E2E multi-tenancy isolation tests for SveltyCMS.
 *
 * These tests verify tenant data isolation at the data layer:
 * - Collection schemas are scoped to their owning tenant
 * - Content entries are isolated per tenant
 * - Media files respect tenant boundaries
 * - Global (tenantId: null) resources are shared across tenants
 *
 * NOTE: The default E2E test server runs in single-tenant mode (MULTI_TENANT not set).
 * In this mode, safeQuery does NOT add tenantId filtering to queries. The tests
 * verify the data-layer tenant tagging patterns that become active when MULTI_TENANT
 * mode is enabled, and validate that records carry the correct tenantId.
 *
 * For full auth-middleware enforcement (403 FORBIDDEN_TENANT), set MULTI_TENANT=true
 * in the Playwright webServer env and ensure users have matching tenantIds.
 *
 * @see docs/reference/architecture/multi-tenancy.mdx
 * @see src/utils/security/safe-query.ts
 * @see src/hooks/handle-authentication.ts
 */

import { test, expect } from "@playwright/test";

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "Password123!";

// Per-run unique identifiers to avoid cross-test collisions
const RUN_ID = Date.now().toString(36);
const TENANT_A_ID = `tenant-a-${RUN_ID}`;
const TENANT_B_ID = `tenant-b-${RUN_ID}`;

// ─── Helper: Call the test API ────────────────────────────────────────────────

/**
 * Calls the /api/testing endpoint and returns the parsed response.
 * The Playwright config automatically includes x-test-mode, x-test-secret,
 * and x-test-worker-index headers on all requests.
 */
async function testingApi(page: import("@playwright/test").Page, data: Record<string, unknown>) {
  const resp = await page.request.post("/api/testing", { data });
  const body = await resp.json();
  return { resp, body, status: resp.status() };
}

/**
 * Calls the test API with sdk-call to invoke a CMS SDK method.
 * Verifies the response is successful and returns the data payload.
 */
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

// ─── Helper: Extract items from various result shapes ─────────────────────────

function extractItems(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.data)) return r.data;
  }
  return [];
}

// ─── Setup ────────────────────────────────────────────────────────────────────

test.describe("Multi-tenancy isolation", () => {
  // Shared admin page for setup operations (the testing API bypasses auth)
  let adminPage: import("@playwright/test").Page;

  test.beforeAll(async ({ browser }) => {
    const adminCtx = await browser.newContext();
    adminPage = await adminCtx.newPage();

    // Step 1: Reset database to clean state
    const { resp: resetResp } = await testingApi(adminPage, { action: "reset" });
    expect(resetResp.ok()).toBeTruthy();

    // Step 2: Seed with admin user
    const { resp: seedResp, body: seedBody } = await testingApi(adminPage, {
      action: "seed",
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    expect(seedResp.ok()).toBeTruthy();
    expect(seedBody.success).toBe(true);

    // Step 3: Login as admin to establish session
    const { resp: loginResp } = await testingApi(adminPage, {
      action: "login",
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    expect(loginResp.ok()).toBeTruthy();

    // Step 4: Create two tenants via the SDK
    const tenantA = await sdkCall(adminPage, "db.system.tenants.create", [
      {
        _id: TENANT_A_ID,
        name: "Tenant A",
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
        name: "Tenant B",
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

    // Step 5: Create a user in Tenant A
    const userA = await sdkCall(adminPage, "auth.createUser", [
      {
        email: `user-a-${RUN_ID}@test.com`,
        password: "Password123!",
        username: `UserA-${RUN_ID}`,
        role: "admin",
        tenantId: TENANT_A_ID,
        isRegistered: true,
        emailVerified: true,
      },
      {},
    ]);
    expect(userA).toBeTruthy();

    // Step 6: Create a user in Tenant B
    const userB = await sdkCall(adminPage, "auth.createUser", [
      {
        email: `user-b-${RUN_ID}@test.com`,
        password: "Password123!",
        username: `UserB-${RUN_ID}`,
        role: "admin",
        tenantId: TENANT_B_ID,
        isRegistered: true,
        emailVerified: true,
      },
      {},
    ]);
    expect(userB).toBeTruthy();
  });

  // ─── Test 1: Cross-tenant collection access is blocked ─────────────────────

  test("Test 1: Cross-tenant collection access is blocked", async () => {
    const colIdA = `col-a-${RUN_ID}`;
    const colIdB = `col-b-${RUN_ID}`;

    // Step 1: Create two content structure nodes — one for each tenant.
    // These simulate collection registration with explicit tenant scopes.
    const nodeA = await sdkCall(adminPage, "db.content.nodes.upsertContentStructureNode", [
      {
        _id: colIdA,
        path: `/collection/col-a-${RUN_ID}`,
        name: `Collection A ${RUN_ID}`,
        nodeType: "collection",
        collectionDef: {
          _id: colIdA,
          name: `Collection A ${RUN_ID}`,
          fields: [
            { db_fieldName: "title", name: "Title", widget: { Name: "Input" }, type: "string" },
          ],
        },
        status: "publish",
        source: "test",
        tenantId: TENANT_A_ID,
      },
    ]);
    expect(nodeA).toBeTruthy();

    const nodeB = await sdkCall(adminPage, "db.content.nodes.upsertContentStructureNode", [
      {
        _id: colIdB,
        path: `/collection/col-b-${RUN_ID}`,
        name: `Collection B ${RUN_ID}`,
        nodeType: "collection",
        collectionDef: {
          _id: colIdB,
          name: `Collection B ${RUN_ID}`,
          fields: [
            { db_fieldName: "title", name: "Title", widget: { Name: "Input" }, type: "string" },
          ],
        },
        status: "publish",
        source: "test",
        tenantId: TENANT_B_ID,
      },
    ]);
    expect(nodeB).toBeTruthy();

    // Step 2: Query content structure for Tenant A — should see only A's node.
    const structureA = await sdkCall(adminPage, "db.content.nodes.getStructure", [
      "flat",
      { tenantId: TENANT_A_ID },
    ]);
    const idsA = extractItems(structureA).map((n: any) => n._id);
    expect(idsA).toContain(colIdA);
    expect(idsA).not.toContain(colIdB);

    // Step 3: Query content structure for Tenant B — should see only B's node.
    const structureB = await sdkCall(adminPage, "db.content.nodes.getStructure", [
      "flat",
      { tenantId: TENANT_B_ID },
    ]);
    const idsB = extractItems(structureB).map((n: any) => n._id);
    expect(idsB).not.toContain(colIdA);
    expect(idsB).toContain(colIdB);

    // Step 4: Verify Tenant B can see its own collection (empty but valid list)
    expect(idsB.length).toBeGreaterThanOrEqual(1);

    // Step 5: Directly verify the tenantId on each node
    const nodeAVerified = await sdkCall(adminPage, "db.content.nodes.getStructure", [
      "flat",
      { bypassTenantCheck: true, tenantId: TENANT_A_ID },
    ]);
    const nodeARecord = extractItems(nodeAVerified).find((n: any) => n._id === colIdA);
    expect(nodeARecord).toBeTruthy();
    expect((nodeARecord as any).tenantId).toBe(TENANT_A_ID);

    const nodeBRecord = extractItems(nodeAVerified).find((n: any) => n._id === colIdB);
    expect(nodeBRecord).toBeTruthy();
    expect((nodeBRecord as any).tenantId).toBe(TENANT_B_ID);
  });

  // ─── Test 2: Cross-tenant file access is blocked ──────────────────────────

  test("Test 2: Cross-tenant file access is blocked", async () => {
    const mediaIdA = `media-a-${RUN_ID}`;
    const mediaIdB = `media-b-${RUN_ID}`;

    // Step 1: Insert media records for each tenant directly via CRUD.
    // Uses bypassTenantCheck to write the records with explicit tenantIds.
    const mediaA = await sdkCall(adminPage, "db.crud.insert", [
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
    expect(mediaA).toBeTruthy();

    const mediaB = await sdkCall(adminPage, "db.crud.insert", [
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
    expect(mediaB).toBeTruthy();

    // Step 2: Query media as Tenant A — should find only A's file.
    const mediaAsA = await sdkCall(adminPage, "db.crud.findMany", [
      "media",
      {},
      { tenantId: TENANT_A_ID },
    ]);
    const itemsA = extractItems(mediaAsA);
    const aHasOwn = itemsA.some((m: any) => m._id === mediaIdA);
    const aHasOther = itemsA.some((m: any) => m._id === mediaIdB);
    expect(aHasOwn).toBe(true);
    expect(aHasOther).toBe(false);

    // Step 3: Query media as Tenant B — should find only B's file.
    const mediaAsB = await sdkCall(adminPage, "db.crud.findMany", [
      "media",
      {},
      { tenantId: TENANT_B_ID },
    ]);
    const itemsB = extractItems(mediaAsB);
    const bHasOwn = itemsB.some((m: any) => m._id === mediaIdB);
    const bHasOther = itemsB.some((m: any) => m._id === mediaIdA);
    expect(bHasOwn).toBe(true);
    expect(bHasOther).toBe(false);

    // Step 4: Verify each media record has the correct tenantId.
    const verifyA = await sdkCall(adminPage, "db.crud.findOne", [
      "media",
      { _id: mediaIdA },
      { bypassTenantCheck: true },
    ]);
    expect(verifyA).toBeTruthy();
    expect(verifyA.tenantId).toBe(TENANT_A_ID);

    const verifyB = await sdkCall(adminPage, "db.crud.findOne", [
      "media",
      { _id: mediaIdB },
      { bypassTenantCheck: true },
    ]);
    expect(verifyB).toBeTruthy();
    expect(verifyB.tenantId).toBe(TENANT_B_ID);
  });

  // ─── Test 3: Cross-tenant content isolation ───────────────────────────────

  test("Test 3: Cross-tenant content isolation", async () => {
    const collectionId = `entries-${RUN_ID}`;
    const entryAId = `entry-a-${RUN_ID}`;
    const entryBId = `entry-b-${RUN_ID}`;

    // Step 1: Create the physical collection table (needed for CRUD).
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

    // Step 2: Insert an entry for Tenant A.
    const entryA = await sdkCall(adminPage, "db.crud.insert", [
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
    expect(entryA).toBeTruthy();

    // Step 3: Insert an entry for Tenant B.
    const entryB = await sdkCall(adminPage, "db.crud.insert", [
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
    expect(entryB).toBeTruthy();

    // Step 4: Query as Tenant A — should only see A's entry.
    const entriesAsA = await sdkCall(adminPage, "db.crud.findMany", [
      collectionId,
      {},
      { tenantId: TENANT_A_ID },
    ]);
    const itemsA = extractItems(entriesAsA);
    const aHasOwn = itemsA.some((e: any) => e._id === entryAId);
    const aHasOther = itemsA.some((e: any) => e._id === entryBId);
    expect(aHasOwn).toBe(true);
    expect(aHasOther).toBe(false);

    // Step 5: Query as Tenant B — should only see B's entry.
    const entriesAsB = await sdkCall(adminPage, "db.crud.findMany", [
      collectionId,
      {},
      { tenantId: TENANT_B_ID },
    ]);
    const itemsB = extractItems(entriesAsB);
    const bHasOwn = itemsB.some((e: any) => e._id === entryBId);
    const bHasOther = itemsB.some((e: any) => e._id === entryAId);
    expect(bHasOwn).toBe(true);
    expect(bHasOther).toBe(false);

    // Step 6: Verify each entry has the correct tenantId.
    const verifyA = await sdkCall(adminPage, "db.crud.findOne", [
      collectionId,
      { _id: entryAId },
      { bypassTenantCheck: true },
    ]);
    expect(verifyA).toBeTruthy();
    expect(verifyA.tenantId).toBe(TENANT_A_ID);
    expect(verifyA.title).toBe(`Tenant A Secret ${RUN_ID}`);

    const verifyB = await sdkCall(adminPage, "db.crud.findOne", [
      collectionId,
      { _id: entryBId },
      { bypassTenantCheck: true },
    ]);
    expect(verifyB).toBeTruthy();
    expect(verifyB.tenantId).toBe(TENANT_B_ID);
    expect(verifyB.title).toBe(`Tenant B Secret ${RUN_ID}`);
  });

  // ─── Test 4: Global resources are shared ──────────────────────────────────

  test("Test 4: Global resources are shared", async () => {
    const globalCollectionId = `global-entries-${RUN_ID}`;
    const globalEntryId = `global-entry-${RUN_ID}`;

    // Step 1: Create the physical collection table.
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

    // Step 2: Insert a global entry (tenantId: null).
    const globalEntry = await sdkCall(adminPage, "db.crud.insert", [
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
    expect(globalEntry).toBeTruthy();

    // Step 3: Verify Tenant A can read the global entry.
    const asTenantA = await sdkCall(adminPage, "db.crud.findMany", [
      globalCollectionId,
      { _id: globalEntryId },
      { bypassTenantCheck: true, tenantId: TENANT_A_ID },
    ]);
    const itemsA = extractItems(asTenantA);
    expect(itemsA.some((e: any) => e._id === globalEntryId)).toBe(true);

    // Step 4: Verify Tenant B can also read the global entry.
    const asTenantB = await sdkCall(adminPage, "db.crud.findMany", [
      globalCollectionId,
      { _id: globalEntryId },
      { bypassTenantCheck: true, tenantId: TENANT_B_ID },
    ]);
    const itemsB = extractItems(asTenantB);
    expect(itemsB.some((e: any) => e._id === globalEntryId)).toBe(true);

    // Step 5: Verify the global entry truly has no tenantId.
    const verify = await sdkCall(adminPage, "db.crud.findOne", [
      globalCollectionId,
      { _id: globalEntryId },
      { bypassTenantCheck: true },
    ]);
    expect(verify).toBeTruthy();
    expect(verify.tenantId).toBeNull();
  });

  // ─── Test 5: Content structure nodes carry correct tenantId ───────────────

  test("Test 5: Content structure nodes carry correct tenantId", async () => {
    const nodeAId = `struct-a-${RUN_ID}`;
    const nodeBId = `struct-b-${RUN_ID}`;

    // Step 1: Create two content structure nodes with explicit tenantIds.
    const nodeA = await sdkCall(adminPage, "db.content.nodes.upsertContentStructureNode", [
      {
        _id: nodeAId,
        path: `/collection/struct-a-${RUN_ID}`,
        name: `Struct A ${RUN_ID}`,
        nodeType: "collection",
        collectionDef: { _id: nodeAId, name: `Struct A ${RUN_ID}`, fields: [] },
        status: "publish",
        source: "test",
        tenantId: TENANT_A_ID,
      },
    ]);
    expect(nodeA).toBeTruthy();

    const nodeB = await sdkCall(adminPage, "db.content.nodes.upsertContentStructureNode", [
      {
        _id: nodeBId,
        path: `/collection/struct-b-${RUN_ID}`,
        name: `Struct B ${RUN_ID}`,
        nodeType: "collection",
        collectionDef: { _id: nodeBId, name: `Struct B ${RUN_ID}`, fields: [] },
        status: "publish",
        source: "test",
        tenantId: TENANT_B_ID,
      },
    ]);
    expect(nodeB).toBeTruthy();

    // Step 2: Get all flat structure for Tenant A.
    const structA = await sdkCall(adminPage, "db.content.nodes.getStructure", [
      "flat",
      { tenantId: TENANT_A_ID },
    ]);
    const idsA = extractItems(structA).map((n: any) => n._id);
    expect(idsA).toContain(nodeAId);
    expect(idsA).not.toContain(nodeBId);

    // Step 3: Get all flat structure for Tenant B.
    const structB = await sdkCall(adminPage, "db.content.nodes.getStructure", [
      "flat",
      { tenantId: TENANT_B_ID },
    ]);
    const idsB = extractItems(structB).map((n: any) => n._id);
    expect(idsB).not.toContain(nodeAId);
    expect(idsB).toContain(nodeBId);

    // Step 4: Direct tenantId check on each node.
    const allNodes = await sdkCall(adminPage, "db.content.nodes.getStructure", [
      "flat",
      { bypassTenantCheck: true },
    ]);
    const allItems = extractItems(allNodes);
    const nodeARecord = allItems.find((n: any) => n._id === nodeAId);
    expect(nodeARecord).toBeTruthy();
    expect((nodeARecord as any).tenantId).toBe(TENANT_A_ID);

    const nodeBRecord = allItems.find((n: any) => n._id === nodeBId);
    expect(nodeBRecord).toBeTruthy();
    expect((nodeBRecord as any).tenantId).toBe(TENANT_B_ID);
  });
});
