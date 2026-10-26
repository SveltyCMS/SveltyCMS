/**
 * @file tests/integration/api/media-folder-rbac.test.ts
 * @description Media virtual-folder CRUD + RBAC against the real dispatcher gate.
 *
 * Ported from `tests/e2e/routes/mediagallery/folder-rbac.spec.ts`, which had no
 * UI interaction (no locators, no clicks) — pure API surface sitting in the E2E
 * tier. The admin-only media specs run with `x-test-secret`, which sets
 * `__testBypass` and skips authorization entirely, so they stay green even when
 * an editor cannot reach the folder endpoints. These probes authenticate with a
 * real session cookie and deliberately send NO `x-test-secret`, so
 * `/api/system-virtual-folder` runs through `handleApiRequests` and the
 * dispatcher's `ENDPOINT_PERMISSIONS` gate (`media:read|write|delete`).
 *
 * Regression: the namespace required `system:settings` and the built-in
 * editor/developer roles lacked `media:*`, so a real editor saw
 * "Failed to load folders" / "Folder creation failed" in the gallery.
 *
 * ### Features:
 * - admin + editor folder create / list / rename / delete over HTTP
 * - anonymous and read-only-role denials with the real auth pipeline
 * - seeds the editor/guest principals through `POST /api/testing`
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  authGet,
  authJson,
  cleanupTestDatabase,
  loginAs,
  prepareAuthenticatedContext,
  testFixtures,
  testingAction,
  waitForServer,
} from "../helpers/server";

const FOLDER_PATH = "/api/system-virtual-folder";
/**
 * `nocache=true` bypasses the turbo/L2 GET cache. Mutations invalidate it
 * asynchronously (debounced), so a plain re-read can legitimately answer with
 * the pre-mutation body and turn a correct handler into a flaky assertion.
 */
const FRESH_LIST_PATH = `${FOLDER_PATH}?nocache=true`;

interface VirtualFolder {
  _id?: string;
  name?: string;
  path?: string;
}

const stamp = Date.now().toString(36).slice(-6);

/**
 * `guest` holds `media:read` but not `media:write` / `media:delete`, so it
 * exercises the dispatcher's capability map without needing a privilege edit.
 */
const guestUser = {
  email: "guest@example.com",
  password: "GuestPass123!",
  username: "guest",
  role: "guest" as const,
};

let adminCookie = "";
let editorCookie = "";
let guestCookie = "";

/** Read the folder tree through the non-bypassed pipeline and assert the envelope. */
async function readFolders(cookie: string): Promise<VirtualFolder[]> {
  const { status, body } = await authGet(FRESH_LIST_PATH, cookie);
  expect(status, JSON.stringify(body)).toBe(200);
  expect(body?.success).toBe(true);
  expect(Array.isArray(body?.data)).toBe(true);
  return body.data as VirtualFolder[];
}

function namesOf(folders: VirtualFolder[]): Array<string | undefined> {
  return folders.map((folder) => folder.name);
}

beforeAll(async () => {
  await waitForServer();
  // Resets the shared DB and returns an admin session.
  adminCookie = await prepareAuthenticatedContext();

  // Seed the non-admin principals through the testing API (never a UI journey).
  for (const user of [testFixtures.editorUser, guestUser]) {
    await testingAction("seed", {
      email: user.email,
      password: user.password,
      username: user.username,
      role: user.role,
    });
  }

  const editor = await loginAs(testFixtures.editorUser.email, testFixtures.editorUser.password);
  expect(editor.status, "editor login").toBe(200);
  expect(editor.cookie, "editor session cookie").not.toBe("");
  editorCookie = editor.cookie;

  const guest = await loginAs(guestUser.email, guestUser.password);
  expect(guest.status, "guest login").toBe(200);
  expect(guest.cookie, "guest session cookie").not.toBe("");
  guestCookie = guest.cookie;
}, 180_000);

afterAll(async () => {
  await cleanupTestDatabase();
});

describe("Media virtual folders — RBAC (real pipeline)", () => {
  it("admin can list virtual folders", async () => {
    const folders = await readFolders(adminCookie);
    expect(Array.isArray(folders)).toBe(true);
  });

  it("editor can list, create, rename and delete virtual folders", async () => {
    // List access alone was the original regression: the folder tree 403'd.
    await readFolders(editorCookie);

    const folderName = `int_rbac_${stamp}`;
    const renamed = `${folderName}_renamed`;

    const created = await authJson("POST", FOLDER_PATH, editorCookie, { name: folderName });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    expect(created.body?.success).toBe(true);
    expect(created.body?.data?.name).toBe(folderName);
    const folderId = String(created.body?.data?._id ?? "");
    expect(folderId).not.toBe("");

    try {
      expect(namesOf(await readFolders(editorCookie))).toContain(folderName);

      const patched = await authJson("PATCH", FOLDER_PATH, editorCookie, {
        folderId,
        name: renamed,
      });
      expect(patched.status, JSON.stringify(patched.body)).toBe(200);
      expect(patched.body?.success).toBe(true);
      expect(patched.body?.data?.name).toBe(renamed);
      expect(patched.body?.data?.path).toBe(`/${renamed}`);

      const afterRename = namesOf(await readFolders(editorCookie));
      expect(afterRename).toContain(renamed);
      expect(afterRename).not.toContain(folderName);
    } finally {
      const deleted = await authJson(
        "DELETE",
        `${FOLDER_PATH}?folderId=${encodeURIComponent(folderId)}`,
        editorCookie,
      );
      expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
      expect(deleted.body?.success).toBe(true);
    }

    expect(namesOf(await readFolders(editorCookie))).not.toContain(renamed);
  });

  it("rejects folder access without a session", async () => {
    // No cookie → safeFetch also skips `x-test-secret`, so no bypass is applied.
    const list = await authGet(FRESH_LIST_PATH);
    expect([401, 403]).toContain(list.status);

    const create = await authJson("POST", FOLDER_PATH, undefined, {
      name: `int_rbac_anon_${stamp}`,
    });
    expect([401, 403]).toContain(create.status);
  });

  it("grants a read-only role list access but denies writes", async () => {
    // `guest` carries `media:read` only — the dispatcher's capability map
    // (`system-virtual-folder` → media:read|write|delete) must reject mutations
    // while still serving the folder tree.
    await readFolders(guestCookie);

    const create = await authJson("POST", FOLDER_PATH, guestCookie, {
      name: `int_rbac_guest_${stamp}`,
    });
    expect(create.status, JSON.stringify(create.body)).toBe(403);

    const remove = await authJson(
      "DELETE",
      `${FOLDER_PATH}?folderId=int_missing_${stamp}`,
      guestCookie,
    );
    expect(remove.status, JSON.stringify(remove.body)).toBe(403);
  });
});
