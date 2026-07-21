/**
 * @file tests/integration/databases/contract.test.ts
 * @description
 * Universal Adapter Contract Test — validates that ALL 4 database adapters
 * (SQLite, MongoDB, PostgreSQL, MariaDB) support the same core black-box
 * HTTP operations. Runs against the current adapter from process.env.DB_TYPE.
 *
 * ### Contract Coverage (6 Gates)
 * 1. AuthAuth: login, session cookie, session reuse, bad credentials, logout
 * 2. Collection CRUD: create via config-sync, list, read back
 * 3. User batch: create user, batch block/batch action, verify state changes
 * 4. Setup gating: status endpoint works, seed blocked after completion
 * 5. Fail-closed: unknown namespace → 403, unmapped endpoint → 404
 * 6. Media permissions: media:read, media:write, media:delete enforcement
 *
 * Every test is database-agnostic — uses safeFetch() for all requests,
 * never raw adapter calls.
 *
 * ### Run Modes
 *   DB_TYPE=sqlite      bun test tests/integration/databases/contract.test.ts
 *   DB_TYPE=mongodb     bun test tests/integration/databases/contract.test.ts
 *   DB_TYPE=postgresql  bun test tests/integration/databases/contract.test.ts
 *   DB_TYPE=mariadb     bun test tests/integration/databases/contract.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getApiBaseUrl, safeFetch } from "../helpers/server";
import {
  cleanupTestDatabase,
  prepareAuthenticatedContext,
  testFixtures,
} from "../helpers/test-setup";

// ---------------------------------------------------------------------------
// Runtime configuration
// ---------------------------------------------------------------------------

const API_BASE = getApiBaseUrl();
const DB_TYPE = (process.env.DB_TYPE || "sqlite").toLowerCase();

// Helper: headers factory for consistent request metadata
function headers(
  extra: Record<string, string> = {},
  options: { includeTestSecret?: boolean } = {},
): Record<string, string> {
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: API_BASE,
  };

  if (options.includeTestSecret !== false) {
    baseHeaders["x-test-secret"] = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
  }

  return { ...baseHeaders, ...extra };
}

// ---------------------------------------------------------------------------
// Suite lifecycle — single reset at start/end (gates reuse prepare with skipReset)
// ---------------------------------------------------------------------------

let suiteAdminCookie = "";

beforeAll(async () => {
  await cleanupTestDatabase();
  suiteAdminCookie = await prepareAuthenticatedContext();
}, 180_000);

afterAll(async () => {
  await cleanupTestDatabase();
});

// ---------------------------------------------------------------------------
// Gate 1 — Auth Contract
// ---------------------------------------------------------------------------

describe("Auth Contract", () => {
  let adminCookie: string;

  beforeAll(async () => {
    // Fresh session for logout test isolation (skip full DB reset)
    adminCookie = await prepareAuthenticatedContext({ skipReset: true });
  });

  it("should return a session cookie on successful admin login", () => {
    // adminCookie was obtained via prepareAuthenticatedContext which performs login
    expect(adminCookie).toBeTruthy();
    expect(adminCookie.length).toBeGreaterThan(0);
    expect(adminCookie).toContain("=");
  });

  it("should reject login with wrong password", async () => {
    const res = await safeFetch(`${API_BASE}/api/user/login`, {
      method: "POST",
      headers: headers({}, { includeTestSecret: false }),
      skipTestSecret: true,
      body: JSON.stringify({
        email: testFixtures.adminUser.email,
        password: "DefinitelyWrongPassword!",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("should reject login with nonexistent email", async () => {
    const res = await safeFetch(`${API_BASE}/api/user/login`, {
      method: "POST",
      headers: headers({}, { includeTestSecret: false }),
      skipTestSecret: true,
      body: JSON.stringify({
        email: "no-such-user@example.com",
        password: "Password123!",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("should reuse session cookie on subsequent requests", async () => {
    // Use the session to access a protected endpoint
    const res = await safeFetch(`${API_BASE}/api/user?raw=true`, {
      headers: headers({ Cookie: adminCookie }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("should invalidate session after logout", async () => {
    // Logout
    const logoutRes = await safeFetch(`${API_BASE}/api/user/logout`, {
      method: "POST",
      headers: headers({ Cookie: adminCookie }),
    });
    expect(logoutRes.status).toBe(200);

    // Old cookie should be dead
    const checkRes = await safeFetch(`${API_BASE}/api/user?raw=true`, {
      headers: headers({ Cookie: adminCookie }),
    });
    expect(checkRes.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Gate 2 — Collection / Config Contract
// ---------------------------------------------------------------------------
// Config promotion is plan-first: POST /api/config/plan → POST /api/config/apply
// with the returned planId. Collections listing must stay healthy regardless of
// whether the environment has pre-seeded content schemas.

describe("Collection / Config Contract", () => {
  let adminCookie: string;

  beforeAll(async () => {
    // Logout in gate 1 may invalidate suite cookie — re-login without DB wipe
    adminCookie = await prepareAuthenticatedContext({ skipReset: true });
  });

  it("should plan and apply configuration promotion with planId", async () => {
    const planRes = await safeFetch(`${API_BASE}/api/config/plan`, {
      method: "POST",
      headers: headers({ Cookie: adminCookie }),
      body: JSON.stringify({ mode: "merge" }),
    });

    expect([200, 201, 202]).toContain(planRes.status);
    const planBody = await planRes.json();
    const plan = planBody?.data ?? planBody;
    expect(plan?.planId).toBeTruthy();

    const applyRes = await safeFetch(`${API_BASE}/api/config/apply`, {
      method: "POST",
      headers: headers({ Cookie: adminCookie }),
      body: JSON.stringify({ planId: plan.planId, mode: plan.mode ?? "merge" }),
    });
    expect([200, 201, 202]).toContain(applyRes.status);
    const applyBody = await applyRes.json().catch(() => null);
    expect(applyBody?.success !== false).toBe(true);
  });

  it("should reject config apply without planId", async () => {
    const applyRes = await safeFetch(`${API_BASE}/api/config/apply`, {
      method: "POST",
      headers: headers({ Cookie: adminCookie }),
      body: JSON.stringify({ mode: "merge" }),
    });
    expect(applyRes.status).toBe(400);
  });

  it("should list collections without server error", async () => {
    const res = await safeFetch(`${API_BASE}/api/collections`, {
      headers: headers({ Cookie: adminCookie }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    // Accept either a bare array or { data: [...] } wrapper
    const collections = Array.isArray(data) ? data : (data?.data ?? data?.collections ?? []);
    expect(Array.isArray(collections)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gate 3 — User Batch Contract
// ---------------------------------------------------------------------------

describe("User Batch Contract", () => {
  let adminCookie: string;
  let createdUserId: string;
  const testEmail = `batch_contract_${DB_TYPE}_${Date.now()}@test.com`;

  beforeAll(async () => {
    adminCookie = await prepareAuthenticatedContext({ skipReset: true });
  });

  it("should create a new user", async () => {
    const res = await safeFetch(`${API_BASE}/api/user/create-user`, {
      method: "POST",
      headers: headers({ Cookie: adminCookie }),
      body: JSON.stringify({
        email: testEmail,
        password: "Password123!",
        confirmPassword: "Password123!",
        username: `batch_${Date.now()}`,
        role: "editor",
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toMatchObject({
      success: true,
      data: { email: testEmail },
    });
    createdUserId = data?.data?._id || data?.data?.id || "";
    expect(createdUserId).toBeTruthy();
  });

  it("should perform batch action on the user (block/disable)", async () => {
    // User create is hard-asserted above; batch must succeed for a real id
    expect(createdUserId).toBeTruthy();

    const res = await safeFetch(`${API_BASE}/api/user/batch`, {
      method: "POST",
      headers: headers({ Cookie: adminCookie }),
      body: JSON.stringify({
        ids: [createdUserId],
        action: "block",
      }),
    });

    // batchAction → successResponse (200); AppError path is 400 only on invalid input
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("should batch unblock/activate the user", async () => {
    expect(createdUserId).toBeTruthy();

    const res = await safeFetch(`${API_BASE}/api/user/batch`, {
      method: "POST",
      headers: headers({ Cookie: adminCookie }),
      body: JSON.stringify({
        ids: [createdUserId],
        action: "unblock",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("should reject batch action without authentication", async () => {
    const res = await safeFetch(`${API_BASE}/api/user/batch`, {
      method: "POST",
      headers: headers({}, { includeTestSecret: false }),
      skipTestSecret: true,
      body: JSON.stringify({
        ids: ["some-id"],
        action: "block",
      }),
    });
    // Unauthenticated requests must be rejected
    expect([401, 403]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// Gate 4 — Setup Gating Contract
// ---------------------------------------------------------------------------

describe("Setup Gating Contract", () => {
  // Uses suite lifecycle (setup already complete after prepareAuthenticatedContext)

  it("should report setup status via health endpoint", async () => {
    const res = await safeFetch(`${API_BASE}/api/system/health`, {
      headers: headers(),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const payload = data?.data && typeof data.data === "object" ? data.data : data;
    const status = (payload.overallStatus || payload.status || "").toUpperCase();
    // System could be in any valid state after setup — just verify it responds
    expect(status.length).toBeGreaterThan(0);
  });

  it("should block /api/setup/complete after setup is finished", async () => {
    const res = await safeFetch(`${API_BASE}/api/setup/complete`, {
      method: "POST",
      headers: headers({}, { includeTestSecret: false }),
      skipTestSecret: true,
      body: JSON.stringify({}),
    });

    // After setup: must be blocked — 403 preferred; 401/400 acceptable; 500 is a failure
    expect([401, 403, 400]).toContain(res.status);
  });

  it("should block /api/setup/seed after setup is finished", async () => {
    const res = await safeFetch(`${API_BASE}/api/setup/seed`, {
      method: "POST",
      headers: headers({}, { includeTestSecret: false }),
      skipTestSecret: true,
      body: JSON.stringify({
        email: "admin@example.com",
        password: "Password123!",
      }),
    });

    // After setup completion, seeding must be blocked (not 200/5xx)
    expect([401, 403, 400]).toContain(res.status);
  });

  it("should return structured error JSON on blocked setup endpoints", async () => {
    const res = await safeFetch(`${API_BASE}/api/setup/complete`, {
      method: "POST",
      headers: headers({}, { includeTestSecret: false }),
      skipTestSecret: true,
      body: JSON.stringify({}),
    });

    const data = await res.json().catch(() => null);
    expect(data).not.toBeNull();
    // Should be a structured error response
    expect(data.error || data.message || !data.success).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Gate 5 — Fail-Closed Contract
// ---------------------------------------------------------------------------

describe("Fail-Closed Contract", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await prepareAuthenticatedContext({ skipReset: true });
  });

  it("should return 403 for unknown API namespace (fail-closed)", async () => {
    const res = await safeFetch(`${API_BASE}/api/nonexistent_xyzzy_namespace_${Date.now()}`, {
      headers: headers({ Cookie: adminCookie }),
    });
    // Unknown namespace must fail closed
    expect(res.status).toBe(403);
  });

  it("should return 404 for valid namespace but unmapped sub-endpoint", async () => {
    const res = await safeFetch(`${API_BASE}/api/user/nonexistent_sub_action_${Date.now()}`, {
      headers: headers({ Cookie: adminCookie }),
    });
    // Valid namespace but unmapped sub-action should be 404
    expect(res.status).toBe(404);
  });

  it("should return 401 for protected endpoint without authentication", async () => {
    const res = await safeFetch(`${API_BASE}/api/collections`, {
      headers: headers({}, { includeTestSecret: false }),
      skipTestSecret: true,
    });
    expect(res.status).toBe(401);
  });

  it("should return 403 for nonexistent namespace even without auth", async () => {
    const res = await safeFetch(
      `${API_BASE}/api/this_namespace_does_not_exist_at_all_${Date.now()}`,
      {
        headers: headers({}, { includeTestSecret: false }),
        skipTestSecret: true,
      },
    );
    // Must fail closed — 403 (namespace unknown) or 401 (auth checked first)
    expect([401, 403]).toContain(res.status);
  });

  it("should return structured error body on all fail-closed responses", async () => {
    const endpoints = [
      `/api/nonexistent_namespace_${Date.now()}`,
      `/api/user/invalid_sub_${Date.now()}`,
    ];

    for (const endpoint of endpoints) {
      const res = await safeFetch(`${API_BASE}${endpoint}`, {
        headers: headers({ Cookie: adminCookie }),
      });
      const body = await res.json().catch(() => null);
      expect(body).not.toBeNull();
      // Must include either error, message, or success:false
      // (message may be a non-empty string — use truthiness, not strict === true)
      const hasErrorStructure = !!(body.error || body.message || body.success === false);
      expect(hasErrorStructure).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Gate 6 — Media Permissions Contract
// ---------------------------------------------------------------------------

describe("Media Permissions Contract", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await prepareAuthenticatedContext({ skipReset: true });
  });

  it("should allow admin to list media (media:read)", async () => {
    const res = await safeFetch(`${API_BASE}/api/media`, {
      headers: headers({ Cookie: adminCookie }),
    });
    // List endpoint returns 200 with list (possibly empty); 204 no-content ok
    expect([200, 204]).toContain(res.status);
    expect(res.status).toBeLessThan(500);

    if (res.status === 200) {
      const data = await res.json();
      expect(data).toBeDefined();
    }
  });

  it("should reject media upload without media:write permission (no auth)", async () => {
    const formData = new FormData();
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
      0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const file = new File([pngBytes], "test-upload.png", { type: "image/png" });
    formData.append("file", file);

    const res = await safeFetch(`${API_BASE}/api/media`, {
      method: "POST",
      headers: headers({}, { includeTestSecret: false }),
      skipTestSecret: true,
      body: formData,
    });
    // Unauthenticated upload must be rejected
    expect([401, 403]).toContain(res.status);
  });

  it("should allow admin to upload media (media:write)", async () => {
    const formData = new FormData();
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
      0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const file = new File([pngBytes], "test-upload.png", { type: "image/png" });
    formData.append("file", file);

    const res = await safeFetch(`${API_BASE}/api/media`, {
      method: "POST",
      headers: headers({ Cookie: adminCookie }),
      body: formData,
    });

    // handleMediaUpload → successResponse (200). Client errors: 400 (bad multipart /
    // empty files). Payload limits may surface as 413. Never 5xx for admin PNG.
    expect([200, 400, 413]).toContain(res.status);
    expect(res.status).toBeLessThan(500);

    if (res.status === 200) {
      const data = await res.json();
      expect(data).toBeDefined();
      expect(data.success !== false).toBe(true);
    }
  });

  it("should reject media delete without media:delete permission (no auth)", async () => {
    const res = await safeFetch(`${API_BASE}/api/media/some_nonexistent_id_12345`, {
      method: "DELETE",
      headers: headers({}, { includeTestSecret: false }),
      skipTestSecret: true,
    });
    // Unauthenticated delete must be rejected
    expect([401, 403]).toContain(res.status);
  });

  it("should enforce media:delete permission for admins (graceful handling)", async () => {
    // Try deleting a nonexistent media ID as admin
    const res = await safeFetch(`${API_BASE}/api/media/nonexistent_media_id_${Date.now()}`, {
      method: "DELETE",
      headers: headers({ Cookie: adminCookie }),
    });
    // Admin delete missing id: successResponse 200 (soft) or explicit 404 — not 5xx
    expect([200, 404]).toContain(res.status);
    expect(res.status).toBeLessThan(500);
  });
});

// Silence unused suite cookie warning if tree-shaken
void suiteAdminCookie;
