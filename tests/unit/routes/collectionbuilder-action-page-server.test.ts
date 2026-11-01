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
  // Widget registry the route's `goThrough()` resolves factory calls against.
  // Empty by default: without a `GuiSchema` the generator leaves each field as
  // plain JSON, which is what the persistence assertions parse. A test that
  // wants the `widgets.X(...)` substitution registers a GuiSchema-bearing entry.
  widgetFunctions: {} as Record<string, { GuiSchema?: Record<string, unknown> }>,
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
  widgets: {
    get widgetFunctions() {
      return state.widgetFunctions;
    },
  },
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

function makeSaveEvent(
  form: FormData,
  locals: LocalsFixture = makeLocals(),
  path = "/config/collectionbuilder/new",
): SaveCollectionEvent {
  return {
    url: new URL(`http://localhost${path}`),
    request: new Request(`http://localhost${path}`, {
      method: "POST",
      body: form,
    }),
    locals,
  } as unknown as SaveCollectionEvent;
}

const TITLE_FIELDS: FieldPayload[] = [
  { db_fieldName: "title", label: "Title", widget: { Name: "Input", key: "Input" } },
];

/** The fields of the seeded blog blueprint (`PRESET_COLLECTIONS.blog[0]`). */
const POSTS_FIELDS: FieldPayload[] = [
  { db_fieldName: "title", label: "Title", widget: { Name: "Input", key: "Input" } },
  { db_fieldName: "slug", label: "Slug", widget: { Name: "Slug", key: "Slug" } },
  { db_fieldName: "content", label: "Content", widget: { Name: "RichText", key: "RichText" } },
  { db_fieldName: "excerpt", label: "Excerpt", widget: { Name: "Input", key: "Input" } },
];

/**
 * The `fields` literal exactly as it sits in the generated collection file.
 *
 * The generator prints the field list as one expression after `fields:` — an
 * ARRAY literal for the builder (`fields: [widgets.Input({…}), …]`) or, before
 * the CB2 fix, an index-keyed map (`fields: {"0": {…}}`). Extracting the literal
 * instead of a shape-specific regex keeps the assertion about the persisted
 * shape, not about how the line is formatted.
 */
function persistedFieldsLiteral(source: string): string {
  const match = /^[\t ]*fields:[\t ]*(.+)$/m.exec(source);
  if (!match) {
    throw new Error(`Generated collection file has no fields property:\n${source}`);
  }
  return match[1].replace(/,[\t ]*$/, "").trim();
}

/**
 * Re-reads a collection from the in-memory store by parsing the file the route
 * generated. This makes the persistence test a genuine round-trip: the shape
 * asserted on the second load comes only from what was written to disk.
 *
 * STRICT: the persisted list must be an ARRAY literal. The base commit wrote an
 * index-keyed map, which is order-lossy by construction — reading it back as an
 * array (`Object.values`) would silently paper over exactly the regression this
 * file exists to catch.
 */
function parseSavedCollection(name: string): SavedCollection | null {
  const source = state.files.get(`${state.collectionsPath}/${name}.ts`);
  if (!source) return null;

  const idMatch = /^\s*_id:\s*"([^"]*)",?$/m.exec(source);
  const nameMatch = /^\s*name:\s*"([^"]*)",?$/m.exec(source);
  if (!nameMatch) {
    throw new Error(`Generated collection file is not parseable for ${name}:\n${source}`);
  }

  const literal = persistedFieldsLiteral(source);
  const parsedFields = JSON.parse(literal) as unknown;
  if (!Array.isArray(parsedFields)) {
    throw new Error(`Persisted fields must be an array literal for ${name}, got: ${literal}`);
  }

  return {
    _id: idMatch?.[1] ?? nameMatch[1],
    name: nameMatch[1],
    fields: parsedFields as SavedField[],
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
    state.widgetFunctions = {};
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

    // CB2 (shape pin): the widget list must be persisted as an ORDERED ARRAY.
    // The base commit re-keyed it into an index-keyed map and wrote
    // `fields: {"0": {…}}`; such a map cannot express a display order that
    // differs from the index order, so both the array literal and its readability
    // as a JSON array are asserted here — and the map shape is refused.
    const literal = persistedFieldsLiteral(written as string);
    expect(
      (written as string).includes("fields: {"),
      `generated file kept the map shape:\n${written}`,
    ).toBe(false);
    expect(
      literal.startsWith("["),
      `persisted fields must be an array literal, got: ${literal}`,
    ).toBe(true);
    const parsedFields = JSON.parse(literal) as unknown;
    expect(Array.isArray(parsedFields)).toBe(true);
    expect((parsedFields as SavedField[])[0]?.db_fieldName).toBe("title");

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

  it("emits `widgets.*` factory calls in array order once the registry provides a GuiSchema (AST substitution)", async () => {
    // `goThrough()` substitutes only a widget it finds in the registry AND that
    // declares a GuiSchema; without one the field stays plain JSON, which is what
    // the persistence assertions above read. This exercises the substitution path
    // against the ordered-array shape, through the real AST generator.
    state.widgetFunctions.Input = {
      GuiSchema: {
        label: { widget: "Input", required: true },
        db_fieldName: { widget: "Input", required: false },
      },
    };

    const ordered: FieldPayload[] = [
      { db_fieldName: "second", label: "Second", widget: { Name: "Input", key: "Input" } },
      { db_fieldName: "first", label: "First", widget: { Name: "Input", key: "Input" } },
    ];

    const saved = (await actions.saveCollection(
      makeSaveEvent(makeCollectionForm("Widgeted", ordered)),
    )) as unknown as ActionOutcome;
    expect(saved).toEqual({ contentVersion: "v1", changedIds: [] });

    const written = state.files.get(`${state.collectionsPath}/Widgeted.ts`);
    expect(written).toBeDefined();
    const source = written as string;

    // The generator wraps each widget call in the 🗑️ marker and strips the JSON
    // quoting around it. A surviving marker means the call is still string data.
    expect(source).not.toContain("🗑️");

    const literal = persistedFieldsLiteral(source);
    expect(
      literal.startsWith("[widgets.Input("),
      `fields literal lost the factory call: ${literal}`,
    ).toBe(true);
    // Order survives the substitution: posted order is what lands in the file.
    const secondAt = literal.indexOf('"db_fieldName":"second"');
    const firstAt = literal.indexOf('"db_fieldName":"first"');
    expect(secondAt).toBeGreaterThan(-1);
    expect(firstAt).toBeGreaterThan(-1);
    expect(secondAt).toBeLessThan(firstAt);
    // The call must be bound by the generated import, not by a dangling identifier.
    expect(source).toContain("@widgets/widget-manager.svelte");
    // And the list is still an array, never the index-keyed map.
    expect(source.includes("fields: {")).toBe(false);
  });

  it("saves an existing blueprint collection and preserves its behavioural flags (CB1)", async () => {
    // The seeded `posts` blueprint as the registry hands it to the editor. The
    // CB1 retest failure was an edit of exactly this shape returning 500
    // (`s.replace` on a null) — and, once it stopped throwing, the regenerated
    // file dropped every flag the field canvas does not own.
    const stored = {
      _id: "posts",
      name: "posts",
      icon: "mdi:post-outline",
      status: "publish",
      slug: "/posts",
      description: "Blog posts with SEO support and rich text editing",
      revision: true,
      revisionLimit: 100,
      livePreview: "/posts/{slug}",
      fields: POSTS_FIELDS,
    };
    state.getCollectionImpl = () => stored;

    // Load → edit → save, like the editor: the form is populated from the
    // serialised collection, including the flags the canvas renders elsewhere.
    const loaded = (await load(makeLoadEvent("edit", "posts"))) as unknown as LoadResult;
    const collection = requireCollection(loaded);
    expect(collection.revision).toBe(true);
    expect(collection.revisionLimit).toBe(100);
    expect(collection.livePreview).toBe("/posts/{slug}");

    const form = makeCollectionForm("posts", POSTS_FIELDS);
    form.set("_id", String(collection._id));
    form.set("originalName", "posts");
    form.set("revision", String(collection.revision));
    form.set("revisionLimit", String(collection.revisionLimit));
    form.set("livePreview", String(collection.livePreview));

    const saved = (await actions.saveCollection(
      makeSaveEvent(form, makeLocals(), "/config/collectionbuilder/edit/posts"),
    )) as unknown as ActionOutcome;

    expect(saved).toEqual({ contentVersion: "v1", changedIds: [] });
    const written = state.files.get(`${state.collectionsPath}/posts.ts`);
    expect(written).toBeDefined();
    const source = written as string;

    expect(source).toContain('_id: "posts"');
    expect(source).toContain("revision: true,");
    expect(source).toContain("revisionLimit: 100,");
    expect(source).toContain('livePreview: "/posts/{slug}",');

    // The field list still round-trips as the ordered array (CB2 shape).
    const literal = persistedFieldsLiteral(source);
    expect(literal.startsWith("[")).toBe(true);
    expect((JSON.parse(literal) as SavedField[]).map((field) => field.db_fieldName)).toEqual([
      "title",
      "slug",
      "content",
      "excerpt",
    ]);
  });

  it("enables revisions for a new collection by default and preserves an explicit opt-out", async () => {
    // Creation path default (competitive bet #1): a collection whose source file
    // does not exist yet saves with history enabled and the documented limit.
    const created = await actions.saveCollection(
      makeSaveEvent(makeCollectionForm("WithRevisions", TITLE_FIELDS)),
    );
    expect(created).toEqual({ contentVersion: "v1", changedIds: [] });

    const createdSource = state.files.get(`${state.collectionsPath}/WithRevisions.ts`);
    expect(createdSource).toBeDefined();
    expect(createdSource).toContain("revision: true,");
    expect(createdSource).toContain("revisionLimit: 100,");

    // An explicit `false` is an author decision and must never be overwritten by
    // the creation default (nor get a meaningless limit).
    const optedOutForm = makeCollectionForm("NoRevisions", TITLE_FIELDS);
    optedOutForm.set("revision", "false");
    optedOutForm.set("revisionLimit", "250");
    const optedOut = await actions.saveCollection(makeSaveEvent(optedOutForm));
    expect(optedOut).toEqual({ contentVersion: "v1", changedIds: [] });

    const optedOutSource = state.files.get(`${state.collectionsPath}/NoRevisions.ts`);
    expect(optedOutSource).toBeDefined();
    expect(optedOutSource).not.toContain("revision: true,");
    expect(optedOutSource).not.toContain("revisionLimit:");
  });

  it("does not turn revisions on for an existing collection that never enabled them", async () => {
    // Editing an existing file must not silently opt it into history. Only a
    // posted toggle (or the creation default for an absent file) changes the flag.
    const existingPath = `${state.collectionsPath}/Legacy.ts`;
    state.files.set(
      existingPath,
      'export default { _id: "Legacy", name: "Legacy", fields: [] };\n',
    );

    const form = makeCollectionForm("Legacy", TITLE_FIELDS);
    form.set("originalName", "Legacy");
    const saved = (await actions.saveCollection(
      makeSaveEvent(form, makeLocals(), "/config/collectionbuilder/edit/Legacy"),
    )) as unknown as ActionOutcome;

    expect(saved).toEqual({ contentVersion: "v1", changedIds: [] });
    const source = state.files.get(existingPath);
    expect(source).toBeDefined();
    expect(source).not.toContain("revision: true,");
    expect(source).not.toContain("revisionLimit:");
  });

  it("persists the Define tab's revision toggle and a custom limit (and clamps it)", async () => {
    // The toggle/limit live on the Define tab and reach the action through the
    // bound collection store, so the save path must round-trip both values.
    const form = makeCollectionForm("TogglePersist", TITLE_FIELDS);
    form.set("revision", "true");
    form.set("revisionLimit", "250");
    await actions.saveCollection(makeSaveEvent(form));

    const source = state.files.get(`${state.collectionsPath}/TogglePersist.ts`);
    expect(source).toBeDefined();
    expect(source).toContain("revision: true,");
    expect(source).toContain("revisionLimit: 250,");

    // A client can post any positive number; the server clamps to the advertised
    // 1–1000 range instead of persisting an unbounded history budget.
    const tooLarge = makeCollectionForm("ToggleClamped", TITLE_FIELDS);
    tooLarge.set("revision", "true");
    tooLarge.set("revisionLimit", "99999");
    await actions.saveCollection(makeSaveEvent(tooLarge));

    const clamped = state.files.get(`${state.collectionsPath}/ToggleClamped.ts`);
    expect(clamped).toBeDefined();
    expect(clamped).toContain("revisionLimit: 1000,");
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
