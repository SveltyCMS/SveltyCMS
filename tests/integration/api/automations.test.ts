/**
 * @file tests/integration/api/automations.test.ts
 * @description Black-box HTTP for automations — P1 headless companion to webhooks.
 *
 * - Admin list / create / delete
 * - Unauthenticated 401
 * - Editor deny (no config:automations / non-admin mutations)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { waitForServer } from "../helpers/server";
import {
  cleanupTestDatabase,
  prepareAuthenticatedContext,
  testFixtures,
} from "../helpers/test-setup";
import {
  API_BASE_URL,
  authGet,
  authJson,
  ensureEditorUser,
  expectDenied,
  loginAs,
  unwrapEntity,
  unwrapList,
} from "../helpers/config-http";

describe("Automations API (headless HTTP)", () => {
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
    it("GET /api/automations without auth → 401", async () => {
      const { status } = await authGet("/api/automations");
      expectDenied(status, "unauth GET automations");
      expect(status).toBe(401);
    });

    it("POST /api/automations without auth → 401", async () => {
      const { status } = await authJson("POST", "/api/automations", undefined, {
        name: "no-auth",
        active: true,
        trigger: { type: "manual", events: [] },
        operations: [],
      });
      expect(status).toBe(401);
    });

    it("editor denied on GET /api/automations", async () => {
      const { cookie, status: loginStatus } = await loginAs(
        testFixtures.editorUser.email,
        testFixtures.editorUser.password,
      );
      expect(loginStatus).toBe(200);
      const { status } = await authGet("/api/automations", cookie);
      expectDenied(status, "editor GET automations");
    });

    it("editor denied on POST /api/automations (admin-only mutations)", async () => {
      const { cookie } = await loginAs(
        testFixtures.editorUser.email,
        testFixtures.editorUser.password,
      );
      const { status } = await authJson("POST", "/api/automations", cookie, {
        name: "editor-should-fail",
        active: false,
        trigger: { type: "manual", events: [] },
        operations: [],
      });
      expectDenied(status, "editor POST automations");
    });
  });

  describe("admin happy path", () => {
    it("GET /api/automations lists flows for admin", async () => {
      const { status, body } = await authGet("/api/automations", adminCookie);
      expect(status).toBe(200);
      expect(Array.isArray(unwrapList(body)) || body?.success === true || body?.data).toBeTruthy();
    });

    it("POST create → list contains → DELETE removes", async () => {
      const stamp = Date.now().toString(36);
      const name = `integ-auto-${stamp}`;

      const { status: createStatus, body: createdBody } = await authJson(
        "POST",
        "/api/automations",
        adminCookie,
        {
          name,
          description: "Integration test flow",
          active: true,
          trigger: { type: "manual", events: [] },
          operations: [],
        },
      );

      expect([200, 201]).toContain(createStatus);
      const created = unwrapEntity(createdBody);
      const id = created?.id || created?._id;
      expect(
        id,
        `create must return id: ${JSON.stringify(createdBody).slice(0, 300)}`,
      ).toBeTruthy();

      const { status: listStatus, body: listBody } = await authGet("/api/automations", adminCookie);
      expect(listStatus).toBe(200);
      const list = unwrapList(listBody);
      // getFlow(undefined) may return array or single envelope
      const flat = list.length ? list : unwrapList({ data: listBody });
      const found =
        flat.some((f: any) => f.id === id || f.name === name) ||
        (Array.isArray(listBody?.data) &&
          listBody.data.some((f: any) => f.id === id || f.name === name));
      // Some adapters return the full list as data directly
      expect(
        found ||
          JSON.stringify(listBody).includes(String(id)) ||
          JSON.stringify(listBody).includes(name),
      ).toBe(true);

      const { status: delStatus } = await authJson("DELETE", `/api/automations/${id}`, adminCookie);
      expect([200, 204]).toContain(delStatus);
    });
  });
});

// silence unused if tree-shaken
void API_BASE_URL;
