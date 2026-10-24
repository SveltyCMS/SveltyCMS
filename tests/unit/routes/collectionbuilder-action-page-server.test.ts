/**
 * @file tests/unit/routes/collectionbuilder-action-page-server.test.ts
 * @description Behaviour contract for the collection-builder entry route
 * `/config/collectionbuilder/[action]/[...contentPath]`: the load shape for
 * `new`/`edit`, the 403/404/500 refusal paths, a real save-then-re-read through
 * the collection registry, and parallel saves that must not lose a write.
 *
 * Boundaries mocked: `node:fs` (in-memory file map), the content registry
 * (`contentSystem`), the sync coordinator, the migration engine, the permission
 * check, the page guards and the widget registry. The route's own validation,
 * TypeScript-AST generation and path guards run for real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  collectionsPath: "/repo/config/collections",
  initializeCalls: [] as Array<[string | null | undefined]>,
  refreshCalls: [] as Array<[string | null | undefined]>,
  getCollectionCalls: [] as Array<[string, string | null | undefined]>,
  getCollectionImpl: null as null | ((identifier: string, tenantId?: string | null) => unknown),
}));

vi.mock("node:fs", () => {
  const fsMock = {
    renameSync: (from: string, to: string) => {
      const content = state.files.get(from);
      if (content === undefined) throw new Error(`ENOENT: ${from}`);
      state.files.delete(from);
      state.files.set(to, content);
    },
    mkdirSync: () => undefined,
    writeFileSync: (file: string, data: string) => {
      state.files.set(file, String(data));
    },
    existsSync: (file: string) => state.files.has(file),
    unlinkSync: (file: string) => {
      state.files.delete(file);
    },
  };
  return { default: fsMock, ...fsMock };
});

vi.mock("@src/content/index.server", () => ({
  contentSystem: {
    initialize: async (tenantId?: string | null) => {
      state.initializeCalls.push([tenantId]);
    },
    refresh: async (tenantId?: string | null) => {
      state.refreshCalls.push([tenantId]);
    },
    getCollection: async (identifier: string, tenantId?: string | null) => {
      state.getCollectionCalls.push([identifier, tenantId]);
      const impl = state.getCollectionImpl;
      return impl ? await impl(identifier, tenantId) : null;
    },
  },
}));

vi.mock("@src/content/sync-content-state.server", () => ({
  syncContentState: async () => ({
    contentVersion: "v1",
    changedIds: [],
    metrics: { totalMs: 1, processed: 1 },
  }),
}));

vi.mock("@src/services/core/migration-engine", () => ({
  MigrationEngine: {
    createPlan: async () => ({ requiresMigration: false }),
  },
  exemptDeclaredFieldRenames: (plan: unknown) => plan,
}));

vi.mock("@src/databases/auth/permissions", () => ({
  hasCollectionBuilderPermission: vi.fn(() => true),
}));

vi.mock("@utils/page-guards.server", () => ({
  getAuthenticatedUser: (locals: { user?: unknown }) => {
    if (!locals.user) {
      const redirect = new Error("Redirect") as Error & { status: number };
      redirect.status = 302;
      throw redirect;
    }
    return locals.user;
  },
}));

vi.mock("@utils/tenant.server", () => ({
  getCollectionFilePath: (name: string) => `${state.collectionsPath}/${name}.ts`,
  getCollectionsPath: () => state.collectionsPath,
  getCollectionDisplayPath: (name: string) => `config/collections/${name}.ts`,
}));

vi.mock("@src/stores/widget-store.svelte.ts", () => ({
  widgets: { widgetFunctions: {} },
}));

import {
  actions,
  load,
} from "../../../src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/+page.server";
import { hasCollectionBuilderPermission } from "@src/databases/auth/permissions";

interface BuilderUser {
  _id: string;
  email: string;
  username: string;
  role: string;
  avatar: null;
  locale: string;
}

interface LocalsFixture {
  user: BuilderUser | null;
  isAdmin: boolean;
  roles: unknown[];
  tenantId: string | null;
}

interface FieldPayload {
  db_fieldName: string;
  label: string;
  widget: { Name: string; key: string };
}

interface SavedField {
  db_fieldName?: string;
  label?: string;
  widget?: { Name?: string; key?: string };
}

interface SavedCollection {
  _id: string;
  name: string;
  fields: SavedField[];
}

interface LoadResult {
  user: {
    id: string;
    email?: string;
    username?: string;
    role?: string;
    avatar?: unknown;
    locale?: string;
    isAdmin: boolean;
  };
  roles: unknown[];
  collection:
    | null
    | SavedCollection
    | (Record<string, unknown> & { _id?: unknown; name?: string; meta?: unknown });
}

interface ActionOutcome {
  type?: string;
  status?: number;
  data?: { error?: string };
  contentVersion?: string;
  changedIds?: string[];
  driftDetected?: boolean;
}

type LoadEvent = Parameters<typeof load>[0];
type SaveCollectionEvent = Parameters<typeof actions.saveCollection>[0];

function makeLocals(overrides: Partial<LocalsFixture> = {}): LocalsFixture {
  return {
    user: {
      _id: "u1",
      email: "admin@test.com",
      username: "admin",
      role: "admin",
      avatar: null,
      locale: "en",
    },
    isAdmin: true,
    roles: [],
    tenantId: null,
    ...overrides,
  };
}

function makeLoadEvent(
  action: string,
  contentPath?: string,
  locals: LocalsFixture = makeLocals(),
): LoadEvent {
  return {
    locals,
    params: { action, contentPath },
  } as unknown as LoadEvent;
}

function makeCollectionForm(name: string, fields: FieldPayload[]): FormData {
  const form = new FormData();
  form.set("name", name);
  form.set("icon", "");
  form.set("status", "draft");
  form.set("slug", `/${name.toLowerCase()}`);
  form.set("description", "");
  form.set("fields", JSON.stringify(fields));
  return form;
}

function makeSaveEvent(form: FormData, locals: LocalsFixture = makeLocals()): SaveCollectionEvent {
  return {
    request: new Request("http://localhost/config/collectionbuilder/new", {
      method: "POST",
      body: form,
    }),
    locals,
  } as unknown as SaveCollectionEvent;
}

const TITLE_FIELDS: FieldPayload[] = [
  { db_fieldName: "title", label: "Title", widget: { Name: "Input", key: "Input" } },
];

/**
 * Re-reads a collection from the in-memory store by parsing the file the route
 * generated. This makes the persistence test a genuine round-trip: the shape
 * asserted on the second load comes only from what was written to disk.
 */
function parseSavedCollection(name: string): SavedCollection | null {
  const source = state.files.get(`${state.collectionsPath}/${name}.ts`);
  if (!source) return null;

  const idMatch = /^\s*_id:\s*"([^"]*)",?$/m.exec(source);
  const nameMatch = /^\s*name:\s*"([^"]*)",?$/m.exec(source);
  const fieldsMatch = /^\s*fields:\s*(\{.*\}),?$/m.exec(source);
  if (!nameMatch || !fieldsMatch) {
    throw new Error(`Generated collection file is not parseable for ${name}:\n${source}`);
  }

  const fieldMap = JSON.parse(fieldsMatch[1]) as Record<string, SavedField>;
  return {
    _id: idMatch?.[1] ?? nameMatch[1],
    name: nameMatch[1],
    fields: Object.values(fieldMap),
  };
}

function requireCollection(result: LoadResult): Record<string, unknown> {
  const collection = result.collection;
  if (!collection) throw new Error("Expected a serialised collection, got null");
  return collection as Record<string, unknown>;
}

describe("collectionbuilder [action]/[...contentPath] +page.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.files.clear();
    state.initializeCalls.length = 0;
    state.refreshCalls.length = 0;
    state.getCollectionCalls.length = 0;
    state.getCollectionImpl = () => null;
    vi.mocked(hasCollectionBuilderPermission).mockReturnValue(true);
  });

  it("returns a null collection for `new` and a serialised, function-free one for `edit` (load-contract)", async () => {
    const fresh = (await load(makeLoadEvent("new"))) as unknown as LoadResult;
    expect(fresh).toEqual({
      user: {
        id: "u1",
        email: "admin@test.com",
        username: "admin",
        role: "admin",
        avatar: null,
        locale: "en",
        isAdmin: true,
      },
      roles: [],
      collection: null,
    });
    // The `new` branch must not touch the registry at all.
    expect(state.initializeCalls).toHaveLength(0);
    expect(state.getCollectionCalls).toHaveLength(0);

    const stored = {
      _id: "posts",
      name: "Posts",
      fields: [{ db_fieldName: "title", label: "Title", widget: { Name: "Input" } }],
      getFields: () => [],
      meta: { describe: () => "not serialisable", keep: 1 },
    };
    state.getCollectionImpl = () => stored;

    const edited = (await load(makeLoadEvent("edit", "posts"))) as unknown as LoadResult;
    const collection = requireCollection(edited);

    expect(collection._id).toBe("posts");
    expect(collection.name).toBe("Posts");
    expect(collection.fields).toEqual([
      { db_fieldName: "title", label: "Title", widget: { Name: "Input" } },
    ]);
    // Functions are dropped at every depth, plain values survive.
    expect("getFields" in collection).toBe(false);
    expect((collection.meta as { describe?: unknown }).describe).toBeUndefined();
    expect((collection.meta as { keep?: unknown }).keep).toBe(1);

    expect(state.initializeCalls).toEqual([[null]]);
    expect(state.getCollectionCalls).toEqual([["posts", null]]);
  });

  it("stringifies an adapter object `_id` before the editor can post it back", async () => {
    // Mongo hands back an ObjectId: the deep clone drops its prototype, so the
    // loader must stringify from the original object.
    state.getCollectionImpl = () => ({
      _id: { toString: () => "mongo-id-1" },
      name: "Mongo Posts",
      fields: [],
    });

    const data = (await load(makeLoadEvent("edit", "mongo-posts"))) as unknown as LoadResult;
    const collection = requireCollection(data);

    expect(collection._id).toBe("mongo-id-1");
    expect(typeof collection._id).toBe("string");
  });

  it("refuses with 403/404/500 on permission, unknown collection and registry failure (failure-path)", async () => {
    vi.mocked(hasCollectionBuilderPermission).mockReturnValue(false);
    await expect(
      load(makeLoadEvent("edit", "posts", makeLocals({ isAdmin: false }))),
    ).rejects.toMatchObject({ status: 403 });
    // Fail-closed: the permission check precedes any registry access.
    expect(state.getCollectionCalls).toHaveLength(0);

    vi.mocked(hasCollectionBuilderPermission).mockReturnValue(true);
    state.getCollectionImpl = () => null;

    await expect(load(makeLoadEvent("edit", "posts"))).rejects.toMatchObject({ status: 404 });
    // A miss triggers one refresh and a full retry (id + absolute-path form).
    expect(state.refreshCalls).toEqual([[null]]);
    expect(state.getCollectionCalls).toEqual([
      ["posts", null],
      ["/posts", null],
      ["posts", null],
      ["/posts", null],
    ]);

    state.refreshCalls.length = 0;
    state.getCollectionCalls.length = 0;
    state.getCollectionImpl = () => {
      throw new Error("registry exploded");
    };

    await expect(load(makeLoadEvent("edit", "posts"))).rejects.toMatchObject({
      status: 500,
      body: { message: expect.stringContaining("registry exploded") },
    });
    expect(state.refreshCalls).toHaveLength(0);
  });

  it("persists a saved collection so a later load reads it back from the store (persistence)", async () => {
    const filePath = `${state.collectionsPath}/Persisted.ts`;

    const saved = (await actions.saveCollection(
      makeSaveEvent(makeCollectionForm("Persisted", TITLE_FIELDS)),
    )) as unknown as ActionOutcome;

    expect(saved).toEqual({ contentVersion: "v1", changedIds: [] });
    const written = state.files.get(filePath);
    expect(written).toBeDefined();
    expect(written).toContain('name: "Persisted"');
    expect(state.files.size).toBe(1);

    // Re-read through the same virtual store the write populated.
    state.getCollectionImpl = (identifier: string) =>
      parseSavedCollection(identifier.replace(/^\//, ""));
    state.getCollectionCalls.length = 0;

    const reloaded = (await load(makeLoadEvent("edit", "Persisted"))) as unknown as LoadResult;
    const collection = requireCollection(reloaded);

    expect(collection.name).toBe("Persisted");
    expect(collection.fields).toEqual([
      { db_fieldName: "title", label: "Title", widget: { Name: "Input", key: "Input" } },
    ]);
    expect(state.getCollectionCalls).toEqual([["Persisted", null]]);
  });

  it("keeps both collections when two saves run in parallel (concurrency)", async () => {
    const [first, second] = (await Promise.all([
      actions.saveCollection(makeSaveEvent(makeCollectionForm("ConcurrentA", TITLE_FIELDS))),
      actions.saveCollection(makeSaveEvent(makeCollectionForm("ConcurrentB", TITLE_FIELDS))),
    ])) as unknown as [ActionOutcome, ActionOutcome];

    expect(first).toEqual({ contentVersion: "v1", changedIds: [] });
    expect(second).toEqual({ contentVersion: "v1", changedIds: [] });

    expect(state.files.size).toBe(2);
    expect(state.files.get(`${state.collectionsPath}/ConcurrentA.ts`)).toContain(
      'name: "ConcurrentA"',
    );
    expect(state.files.get(`${state.collectionsPath}/ConcurrentB.ts`)).toContain(
      'name: "ConcurrentB"',
    );
  });
});
