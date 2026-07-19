/**
 * @file tests/integration/api/collection-structure.test.ts
 * @description Promote collection-builder risk out of flaky E2E into HTTP:
 * authenticated content/collections structure is readable; unauth denied.
 *
 * Full GUI create flows stay in one golden E2E; this locks the headless surface
 * the builder load path depends on.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { waitForServer } from "../helpers/server";
import { cleanupTestDatabase, prepareAuthenticatedContext } from "../helpers/test-setup";
import { authGet, expectDenied } from "../helpers/config-http";

describe("Collection structure HTTP (builder dependency)", () => {
  let adminCookie: string;

  beforeAll(async () => {
    await waitForServer();
    adminCookie = await prepareAuthenticatedContext();
  }, 120_000);

  afterAll(async () => {
    await cleanupTestDatabase().catch(() => undefined);
  });

  it("GET /api/collections without auth → 401", async () => {
    const { status } = await authGet("/api/collections");
    expectDenied(status, "unauth collections");
    expect(status).toBe(401);
  });

  it("GET /api/collections as admin → 200 list envelope", async () => {
    const { status, body } = await authGet("/api/collections", adminCookie);
    expect(status).toBe(200);
    // Empty install is OK — structure is an array or success envelope
    const raw = body?.data ?? body;
    const ok = Array.isArray(raw) || body?.success === true || (raw && typeof raw === "object");
    expect(ok, `unexpected collections body: ${JSON.stringify(body).slice(0, 200)}`).toBe(true);
  });

  it("GET /api/content without auth → 401 or fail-closed", async () => {
    const { status } = await authGet("/api/content");
    // content namespace may 401 or 403 depending on mapping
    expect([401, 403, 404]).toContain(status);
    expect(status).not.toBe(200);
  });
});
