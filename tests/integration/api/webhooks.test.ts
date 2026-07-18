/**
 * @file tests/integration/api/webhooks.test.ts
 * @description Black-box HTTP coverage for webhooks — Testing 2026 reference domain.
 *
 * P1 headless gap: domain was E2E+unit only. This suite proves:
 * - Admin happy path: list + create + delete
 * - Unauthenticated deny (401)
 * - Non-admin without config:webhooks deny (403)
 *
 * Adapter-agnostic: real session cookies only.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getApiBaseUrl, safeFetch, waitForServer } from "../helpers/server";
import {
  cleanupTestDatabase,
  prepareAuthenticatedContext,
  testFixtures,
} from "../helpers/test-setup";

const API_BASE_URL = getApiBaseUrl();

function unwrapList(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.data)) return body.data.data;
  return [];
}

async function loginAs(
  email: string,
  password: string,
): Promise<{ cookie: string; status: number }> {
  const res = await safeFetch(`${API_BASE_URL}/api/user/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: API_BASE_URL,
    },
    skipTestSecret: true,
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const cookie = setCookie
    .split(/,(?=\s*[^=]+=[^;]+)/)
    .map((c) => c.trim().split(";")[0])
    .filter(Boolean)
    .join("; ");
  return { cookie, status: res.status };
}

async function ensureEditorUser(adminCookie: string): Promise<void> {
  const email = testFixtures.editorUser.email;
  // Best-effort create; ignore conflicts if already seeded
  await safeFetch(`${API_BASE_URL}/api/user/create-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminCookie,
      Origin: API_BASE_URL,
    },
    body: JSON.stringify({
      email,
      password: testFixtures.editorUser.password,
      username: testFixtures.editorUser.username,
      role: "editor",
      confirmPassword: testFixtures.editorUser.password,
    }),
  }).catch(() => undefined);
}

describe("Webhooks API (Testing 2026 reference — headless HTTP)", () => {
  let adminCookie: string;

  beforeAll(async () => {
    await waitForServer();
    adminCookie = await prepareAuthenticatedContext();
    await ensureEditorUser(adminCookie);
  }, 120_000);

  afterAll(async () => {
    await cleanupTestDatabase().catch(() => undefined);
  });

  describe("deny paths", () => {
    it("GET /api/webhooks without auth → 401", async () => {
      const res = await safeFetch(`${API_BASE_URL}/api/webhooks`, {
        headers: { Accept: "application/json", Origin: API_BASE_URL },
        skipTestSecret: true,
      });
      expect(res.status).toBe(401);
    });

    it("POST /api/webhooks without auth → 401", async () => {
      const res = await safeFetch(`${API_BASE_URL}/api/webhooks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: API_BASE_URL,
        },
        body: JSON.stringify({
          name: "no-auth",
          url: "https://example.com/hook",
          events: ["entry:create"],
          active: true,
        }),
        skipTestSecret: true,
      });
      expect(res.status).toBe(401);
    });

    it("editor without config:webhooks → 403 on GET /api/webhooks", async () => {
      const { cookie, status: loginStatus } = await loginAs(
        testFixtures.editorUser.email,
        testFixtures.editorUser.password,
      );
      // If editor cannot log in in this seed, skip with hard failure on setup quality
      expect(loginStatus, "editor login must succeed after ensureEditorUser").toBe(200);
      expect(cookie).toMatch(/auth_sessions/i);

      const res = await safeFetch(`${API_BASE_URL}/api/webhooks`, {
        headers: {
          Accept: "application/json",
          Cookie: cookie,
          Origin: API_BASE_URL,
        },
      });
      // Editors typically lack config:webhooks — fail-closed 403
      expect([403, 401]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });
  });

  describe("admin happy path", () => {
    it("GET /api/webhooks lists webhooks for admin", async () => {
      const res = await safeFetch(`${API_BASE_URL}/api/webhooks`, {
        headers: {
          Accept: "application/json",
          Cookie: adminCookie,
          Origin: API_BASE_URL,
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success === true || Array.isArray(body) || Array.isArray(body?.data)).toBe(true);
      const list = unwrapList(body);
      expect(Array.isArray(list)).toBe(true);
    });

    it("POST create → GET list contains → DELETE removes", async () => {
      const stamp = Date.now().toString(36);
      const name = `integ-webhook-${stamp}`;
      const url = `https://example.com/integ/${stamp}`;

      const createRes = await safeFetch(`${API_BASE_URL}/api/webhooks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Cookie: adminCookie,
          Origin: API_BASE_URL,
        },
        body: JSON.stringify({
          name,
          url,
          events: ["entry:create"],
          active: true,
        }),
      });

      expect([200, 201]).toContain(createRes.status);
      const createdBody = await createRes.json();
      const created =
        createdBody?.data?.data ?? createdBody?.data ?? createdBody?.webhook ?? createdBody;
      const id = created?.id || created?._id;
      expect(
        id,
        `create response must include id: ${JSON.stringify(createdBody).slice(0, 300)}`,
      ).toBeTruthy();

      const listRes = await safeFetch(`${API_BASE_URL}/api/webhooks`, {
        headers: {
          Accept: "application/json",
          Cookie: adminCookie,
          Origin: API_BASE_URL,
        },
      });
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      const list = unwrapList(listBody);
      expect(list.some((w: any) => w.id === id || w.name === name)).toBe(true);

      const delRes = await safeFetch(`${API_BASE_URL}/api/webhooks/${id}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Cookie: adminCookie,
          Origin: API_BASE_URL,
        },
      });
      expect([200, 204]).toContain(delRes.status);

      const listAfter = unwrapList(
        await (
          await safeFetch(`${API_BASE_URL}/api/webhooks`, {
            headers: {
              Accept: "application/json",
              Cookie: adminCookie,
              Origin: API_BASE_URL,
            },
          })
        ).json(),
      );
      expect(listAfter.some((w: any) => w.id === id)).toBe(false);
    });
  });
});
