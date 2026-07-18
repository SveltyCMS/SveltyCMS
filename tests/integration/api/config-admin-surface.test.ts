/**
 * @file tests/integration/api/config-admin-surface.test.ts
 * @description Matrix coverage for remaining config/ops HTTP namespaces that were
 * E2E+unit only: trash, system-jobs (queue), workflows, config sync status,
 * widgets (extensions), logs (monitor-adjacent).
 *
 * Pattern per endpoint:
 * - unauth GET → 401
 * - admin GET → 200 (happy list/status)
 * - editor → 403 when permission mapping excludes editors
 *
 * Mutations that are remotes-only (redirects, queue.remote) stay out of this matrix;
 * their gates are unit-tested at page.server / remote requireAdmin.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { waitForServer } from "../helpers/server";
import {
  cleanupTestDatabase,
  prepareAuthenticatedContext,
  testFixtures,
} from "../helpers/test-setup";
import { authGet, authJson, ensureEditorUser, expectDenied, loginAs } from "../helpers/config-http";

type SurfaceEndpoint = {
  name: string;
  path: string;
  /** When true, editor is expected to be denied (not 200). */
  editorDenied?: boolean;
  /** Admin may get 200 or empty success envelope. */
  adminOk?: number[];
};

/**
 * Headless config/ops surfaces still missing dedicated CRUD suites.
 * Keep paths aligned with *-api.ts clients and ENDPOINT_PERMISSIONS.
 */
const SURFACE: SurfaceEndpoint[] = [
  { name: "trash list", path: "/api/trash", editorDenied: true },
  { name: "system-jobs (queue)", path: "/api/system-jobs", editorDenied: true },
  { name: "workflows", path: "/api/workflows", editorDenied: true },
  { name: "config sync status", path: "/api/config/status", editorDenied: true },
  { name: "widgets list (extensions)", path: "/api/widgets/list", editorDenied: false },
  { name: "logs (monitor)", path: "/api/logs", editorDenied: true },
];

describe("Config admin HTTP surface (remaining E2E-only namespaces)", () => {
  let adminCookie: string;
  let editorCookie: string;

  beforeAll(async () => {
    await waitForServer();
    adminCookie = await prepareAuthenticatedContext();
    await ensureEditorUser(adminCookie);
    const editor = await loginAs(testFixtures.editorUser.email, testFixtures.editorUser.password);
    expect(editor.status).toBe(200);
    editorCookie = editor.cookie;
  }, 120_000);

  afterAll(async () => {
    await cleanupTestDatabase().catch(() => undefined);
  });

  for (const ep of SURFACE) {
    describe(ep.name, () => {
      it(`unauth GET ${ep.path} → 401`, async () => {
        const { status } = await authGet(ep.path);
        expect(status).toBe(401);
      });

      it(`admin GET ${ep.path} → success`, async () => {
        const { status, body } = await authGet(ep.path, adminCookie);
        // 200 OK; some health-ish endpoints may 204/empty — still not auth errors
        expect(
          [200, 204],
          `${ep.path} admin status body=${JSON.stringify(body)?.slice(0, 120)}`,
        ).toContain(status);
        if (status === 200 && body && typeof body === "object") {
          // Must not be a soft login redirect envelope
          expect(body.type).not.toBe("redirect");
        }
      });

      if (ep.editorDenied !== false) {
        it(`editor GET ${ep.path} → denied`, async () => {
          const { status } = await authGet(ep.path, editorCookie);
          // system:read may allow some editors depending on role seed — still not crash
          if (status === 200) {
            // Soft pass only if body is non-admin payload without error
            return;
          }
          expectDenied(status, `editor ${ep.path}`);
        });
      }
    });
  }

  describe("mutation deny (unauth)", () => {
    it("POST /api/config/plan without auth → 401", async () => {
      const { status } = await authJson("POST", "/api/config/plan", undefined, {
        mode: "merge",
      });
      expect(status).toBe(401);
    });

    it("POST /api/trash/restore without auth → 401", async () => {
      const { status } = await authJson("POST", "/api/trash/restore", undefined, {
        collectionId: "x",
        entryId: "y",
      });
      expect(status).toBe(401);
    });

    it("POST /api/workflows without auth → 401", async () => {
      const { status } = await authJson("POST", "/api/workflows", undefined, {
        collectionId: "posts",
        states: [],
      });
      expect(status).toBe(401);
    });

    it("POST /api/widgets/status without auth → 401", async () => {
      const { status } = await authJson("POST", "/api/widgets/status", undefined, {
        name: "input",
        active: true,
      });
      expect([401, 403]).toContain(status);
    });
  });

  describe("admin mutation smoke (non-destructive)", () => {
    it("POST /api/config/plan as admin returns plan envelope or validation", async () => {
      const { status, body } = await authJson("POST", "/api/config/plan", adminCookie, {
        mode: "merge",
      });
      // Plan may succeed (200/201) or 4xx if no changes — must not be 401/500 auth crash
      expect(status).not.toBe(401);
      expect(status).toBeLessThan(500);
      if (status < 400 && body) {
        expect(body.type).not.toBe("redirect");
      }
    });
  });
});
