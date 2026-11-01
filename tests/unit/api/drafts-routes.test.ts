/**
 * @file tests/unit/api/drafts-routes.test.ts
 * @description Whitebox contract for the collection-scoped draft routes
 * (`/api/collections/:collectionId/drafts…`) and their fail-closed permission map.
 *
 * ### Features:
 * - every required endpoint reaches the matching `cms.drafts` method with author context
 * - `{ success, data }` envelope for success and empty results
 * - 400 for a missing/invalid payload or missing draft id, 405 for wrong method
 * - 404 from the SDK passes through untouched
 * - `collections` read/write permission gates mutations; an unmapped namespace stays denied
 *
 * No server or database is involved: the handler receives a stubbed SDK namespace,
 * and `_checkEndpointPermission` is exercised directly.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { createMockRequestEvent } from "../utils/mock-event";

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    crud: {
      findMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
      findOne: vi.fn().mockResolvedValue({ success: true, data: null }),
    },
    auth: {
      getUserById: vi.fn().mockResolvedValue({ success: true, data: null }),
      validateSession: vi.fn().mockResolvedValue({ success: true, user: null }),
    },
    collection: { getModel: vi.fn().mockResolvedValue({}) },
  },
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn(),
  isDbConnected: vi.fn().mockReturnValue(true),
  getAuth: vi.fn().mockReturnValue({}),
  getPrivateEnv: vi.fn().mockReturnValue({}),
  loadPrivateConfig: vi.fn().mockReturnValue({}),
  getBootPhase: vi.fn().mockReturnValue("READY"),
}));

vi.mock("@src/content/index.server", () => ({
  contentSystem: {
    getCollections: vi.fn().mockResolvedValue([]),
    getCollection: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(true),
  getPublicSettingSync: vi.fn().mockReturnValue(false),
  getUntypedSetting: vi.fn().mockResolvedValue(undefined),
  loadSettingsCache: vi.fn(),
  invalidateSettingsCache: vi.fn(),
}));

import { handleCollectionsRoutes } from "@src/routes/api/[...path]/handlers/collections";
import { _checkEndpointPermission } from "@src/routes/api/[...path]/+server";
import { contentSystem } from "@src/content/index.server";
import { AppError } from "@utils/error-handling";
import { LocalCMS } from "@src/services/sdk";
import { SQLiteAdapter } from "@src/databases/sqlite/sqlite-adapter";
import type { Schema } from "@src/content/types";

const TENANT = "tenant-api-drafts";

type DraftMethods = {
  saveDraft: ReturnType<typeof vi.fn>;
  getDraft: ReturnType<typeof vi.fn>;
  discardDraft: ReturnType<typeof vi.fn>;
  discardDraftsForEntry: ReturnType<typeof vi.fn>;
};

function makeCms(overrides: Partial<DraftMethods> = {}): { cms: LocalCMS; drafts: DraftMethods } {
  const drafts: DraftMethods = {
    saveDraft: vi.fn().mockResolvedValue({ success: true, data: { _id: "draft-1", version: 1 } }),
    getDraft: vi.fn().mockResolvedValue({ success: true, data: null }),
    discardDraft: vi.fn().mockResolvedValue({ success: true, data: { deletedCount: 1 } }),
    discardDraftsForEntry: vi.fn().mockResolvedValue({ success: true, data: { deletedCount: 2 } }),
    ...overrides,
  };
  return { cms: { drafts } as unknown as LocalCMS, drafts };
}

async function callRoute(event: RequestEvent, cms: LocalCMS, segments: string[]) {
  return handleCollectionsRoutes(event, cms, TENANT as never, segments);
}

async function bodyOf(response: Response): Promise<{ success: boolean; data: unknown }> {
  return (await response.json()) as { success: boolean; data: unknown };
}

const admin = {
  _id: "admin-1",
  email: "admin@test.dev",
  role: "admin",
  isAdmin: true,
};
// Distinct ids: the permission cache is keyed by (userId, permission, roleIds),
// so reusing one user across opposite expectations would replay the first answer.
const readOnlyEditor = {
  _id: "editor-read",
  email: "read@test.dev",
  role: "editor",
  isAdmin: false,
};
const writeEditor = {
  _id: "editor-write",
  email: "write@test.dev",
  role: "editor",
  isAdmin: false,
};

const editorReadOnly = [
  { _id: "editor", name: "Editor", isAdmin: false, permissions: ["collections:read"] },
];
const editorWrite = [
  {
    _id: "editor",
    name: "Editor",
    isAdmin: false,
    permissions: ["collections:read", "collections:write"],
  },
];

describe("collection draft routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /drafts?entryId= returns the latest draft for the author", async () => {
    const { cms, drafts } = makeCms();
    const event = createMockRequestEvent({
      method: "GET",
      path: "collections/posts/drafts?entryId=entry-1",
    });

    const response = await callRoute(event, cms, ["collections", "posts", "drafts"]);
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toEqual({ success: true, data: null });
    expect(drafts.getDraft).toHaveBeenCalledWith("posts", "entry-1", {
      user: event.locals.user,
      tenantId: TENANT,
    });
  });

  it("GET /:entryId/drafts returns the latest draft for that entry", async () => {
    const { cms, drafts } = makeCms({
      getDraft: vi.fn().mockResolvedValue({ success: true, data: { _id: "draft-1", version: 3 } }),
    });
    const event = createMockRequestEvent({
      method: "GET",
      path: "collections/posts/entry-1/drafts",
    });

    const response = await callRoute(event, cms, ["collections", "posts", "entry-1", "drafts"]);
    expect(response.status).toBe(200);
    expect((await bodyOf(response)).data).toMatchObject({ _id: "draft-1", version: 3 });
    expect(drafts.getDraft).toHaveBeenCalledWith("posts", "entry-1", expect.anything());
  });

  it("GET /drafts without entryId asks for the new-entry draft", async () => {
    const { cms, drafts } = makeCms();
    const event = createMockRequestEvent({ method: "GET", path: "collections/posts/drafts" });

    const response = await callRoute(event, cms, ["collections", "posts", "drafts"]);
    expect(response.status).toBe(200);
    expect(drafts.getDraft).toHaveBeenCalledWith("posts", undefined, expect.anything());
  });

  it("POST /drafts upserts an entry draft", async () => {
    const { cms, drafts } = makeCms();
    const event = createMockRequestEvent({
      method: "POST",
      path: "collections/posts/drafts",
      body: { entryId: "entry-1", data: { title: "hello" } },
    });

    const response = await callRoute(event, cms, ["collections", "posts", "drafts"]);
    expect(response.status).toBe(201);
    expect((await bodyOf(response)).success).toBe(true);
    expect(drafts.saveDraft).toHaveBeenCalledWith(
      "posts",
      { entryId: "entry-1", data: { title: "hello" } },
      { user: event.locals.user, tenantId: TENANT },
    );
  });

  it("POST /drafts creates a new-entry draft when entryId is omitted", async () => {
    const { cms, drafts } = makeCms();
    const event = createMockRequestEvent({
      method: "POST",
      path: "collections/posts/drafts",
      body: { data: { title: "unsaved" } },
    });

    const response = await callRoute(event, cms, ["collections", "posts", "drafts"]);
    expect(response.status).toBe(201);
    expect(drafts.saveDraft).toHaveBeenCalledWith(
      "posts",
      { entryId: undefined, data: { title: "unsaved" } },
      expect.anything(),
    );
  });

  it("POST /drafts rejects a payload without data", async () => {
    const { cms, drafts } = makeCms();
    const event = createMockRequestEvent({
      method: "POST",
      path: "collections/posts/drafts",
      body: { title: "no envelope" },
    });

    await expect(callRoute(event, cms, ["collections", "posts", "drafts"])).rejects.toMatchObject({
      status: 400,
      code: "DRAFT_DATA_REQUIRED",
    });
    expect(drafts.saveDraft).not.toHaveBeenCalled();
  });

  it("POST on the entry-scoped path is 405", async () => {
    const { cms } = makeCms();
    const event = createMockRequestEvent({
      method: "POST",
      path: "collections/posts/entry-1/drafts",
    });

    await expect(
      callRoute(event, cms, ["collections", "posts", "entry-1", "drafts"]),
    ).rejects.toMatchObject({ status: 405 });
  });

  it("DELETE /drafts/:draftId discards one draft", async () => {
    const { cms, drafts } = makeCms();
    const event = createMockRequestEvent({
      method: "DELETE",
      path: "collections/posts/drafts/draft-1",
    });

    const response = await callRoute(event, cms, ["collections", "posts", "drafts", "draft-1"]);
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toEqual({ success: true, data: { deletedCount: 1 } });
    expect(drafts.discardDraft).toHaveBeenCalledWith("posts", "draft-1", expect.anything());
  });

  it("DELETE /drafts without an id is 400", async () => {
    const { cms } = makeCms();
    const event = createMockRequestEvent({ method: "DELETE", path: "collections/posts/drafts" });

    await expect(callRoute(event, cms, ["collections", "posts", "drafts"])).rejects.toMatchObject({
      status: 400,
      code: "DRAFT_ID_REQUIRED",
    });
  });

  it("DELETE /:entryId/drafts discards all drafts for that entry", async () => {
    const { cms, drafts } = makeCms();
    const event = createMockRequestEvent({
      method: "DELETE",
      path: "collections/posts/entry-1/drafts",
    });

    const response = await callRoute(event, cms, ["collections", "posts", "entry-1", "drafts"]);
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toEqual({ success: true, data: { deletedCount: 2 } });
    expect(drafts.discardDraftsForEntry).toHaveBeenCalledWith(
      "posts",
      "entry-1",
      expect.anything(),
    );
  });

  it("propagates the SDK's 404 for an unknown draft", async () => {
    const { cms } = makeCms({
      discardDraft: vi.fn().mockRejectedValue(new AppError("Draft not found.", 404, "NOT_FOUND")),
    });
    const event = createMockRequestEvent({
      method: "DELETE",
      path: "collections/posts/drafts/nope",
    });

    await expect(
      callRoute(event, cms, ["collections", "posts", "drafts", "nope"]),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});

describe("draft endpoint permissions (fail-closed)", () => {
  const draftSegments = ["collections", "posts", "drafts"];

  it("requires collections:read for reads and collections:write for writes", () => {
    expect(
      _checkEndpointPermission(readOnlyEditor, editorReadOnly, "GET", "collections", draftSegments),
    ).toBe(true);
    expect(
      _checkEndpointPermission(
        readOnlyEditor,
        editorReadOnly,
        "POST",
        "collections",
        draftSegments,
      ),
    ).toBe(false);
    expect(
      _checkEndpointPermission(
        readOnlyEditor,
        editorReadOnly,
        "DELETE",
        "collections",
        draftSegments,
      ),
    ).toBe(false);
    expect(
      _checkEndpointPermission(writeEditor, editorWrite, "POST", "collections", draftSegments),
    ).toBe(true);
    expect(_checkEndpointPermission(admin, [], "DELETE", "collections", draftSegments)).toBe(true);
  });

  it("maps a top-level drafts namespace to the collection capability", () => {
    expect(
      _checkEndpointPermission(writeEditor, editorWrite, "POST", "drafts", ["drafts", "posts"]),
    ).toBe(true);
    expect(
      _checkEndpointPermission(readOnlyEditor, editorReadOnly, "GET", "drafts", [
        "drafts",
        "posts",
      ]),
    ).toBe(true);
    expect(
      _checkEndpointPermission(readOnlyEditor, editorReadOnly, "POST", "drafts", [
        "drafts",
        "posts",
      ]),
    ).toBe(false);
  });

  it("keeps an unmapped namespace denied", () => {
    expect(
      _checkEndpointPermission(readOnlyEditor, editorReadOnly, "GET", "not-a-namespace", [
        "not-a-namespace",
      ]),
    ).toBe(false);
  });
});

describe("collection draft routes on a real SQLite adapter", () => {
  const schema = {
    _id: "drafts_api_contract",
    name: "drafts_api_contract",
    slug: "drafts_api_contract",
    fields: [{ db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" }],
  } as Schema;

  let adapter: SQLiteAdapter;
  let cms: LocalCMS;

  beforeAll(async () => {
    adapter = new SQLiteAdapter();
    const conn = await adapter.connect(":memory:");
    expect(conn.success).toBe(true);
    await adapter.provision();
    await adapter.createModel(schema);

    cms = new LocalCMS(adapter as never);
    vi.mocked(contentSystem.getCollection).mockImplementation((async (id: string) =>
      id === schema._id ? schema : null) as never);
  });

  afterAll(async () => {
    await adapter.disconnect();
  });

  it("creates, reads, lists and discards a new-entry draft", async () => {
    const create = createMockRequestEvent({
      method: "POST",
      path: "collections/drafts_api_contract/drafts",
      body: { data: { title: "half typed" } },
    });
    const created = await callRoute(create, cms, ["collections", "drafts_api_contract", "drafts"]);
    expect(created.status).toBe(201);
    const row = (await bodyOf(created)).data as Record<string, unknown>;
    expect(row.contentId).toBe(row._id);
    expect(row.collectionId).toBe(schema._id);
    expect(row.version).toBe(1);
    expect((row.data as Record<string, unknown>).__draft).toEqual({ kind: "new" });

    const read = createMockRequestEvent({
      method: "GET",
      path: "collections/drafts_api_contract/drafts",
    });
    const readResponse = await callRoute(read, cms, [
      "collections",
      "drafts_api_contract",
      "drafts",
    ]);
    expect(readResponse.status).toBe(200);
    expect(((await bodyOf(readResponse)).data as Record<string, unknown>)._id).toBe(row._id);

    const discard = createMockRequestEvent({
      method: "DELETE",
      path: `collections/drafts_api_contract/drafts/${String(row._id)}`,
    });
    const discarded = await callRoute(discard, cms, [
      "collections",
      "drafts_api_contract",
      "drafts",
      String(row._id),
    ]);
    expect(discarded.status).toBe(200);
    expect((await bodyOf(discarded)).data).toEqual({ deletedCount: 1 });

    const empty = createMockRequestEvent({
      method: "GET",
      path: "collections/drafts_api_contract/drafts",
    });
    const emptyResponse = await callRoute(empty, cms, [
      "collections",
      "drafts_api_contract",
      "drafts",
    ]);
    expect(await bodyOf(emptyResponse)).toMatchObject({ success: true, data: null });

    // The shared collections promise: the public namespace still resolves after
    // `drafts` instantiated it (both paths await the same instance).
    const schemaId = schema._id;
    if (!schemaId) throw new Error("test schema is missing _id");
    const resolved = await cms.collections.getSchema(schemaId);
    expect(resolved._id).toBe(schemaId);
  });

  it("answers 404 for an unknown collection", async () => {
    const event = createMockRequestEvent({
      method: "POST",
      path: "collections/not-a-collection/drafts",
      body: { data: { title: "x" } },
    });

    await expect(
      callRoute(event, cms, ["collections", "not-a-collection", "drafts"]),
    ).rejects.toMatchObject({ status: 404 });
  });
});
