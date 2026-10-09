/**
 * @file tests/unit/sdk/misc-namespaces-perf.test.ts
 * @description Behavioral tests for the misc namespaces (Widgets, Importer, WebsiteTokens).
 *
 * Features tested:
 * - WidgetsNamespace.list: core-first then alphabetic ordering, active/core membership
 *   from adapter results (string and { name } forms), pillar/dependency derivation
 * - ImporterNamespace.importExternal: Drupal taxonomy resolution through the
 *   included-entity index, richtext flattening, post-import relationship
 *   resolution, revision import; WordPress flat import; dryRun passthrough;
 *   per-item error accounting
 * - WebsiteTokensNamespace: pagination math, token creation shape, batch delete
 *   auth-cache invalidation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ImporterNamespace,
  WebsiteTokensNamespace,
  WidgetsNamespace,
} from "../../../src/services/sdk/namespaces/misc-namespaces";
import type { DatabaseId, IDBAdapter } from "../../../src/databases/db-interface";

/** Branded tenant id from a plain string (LocalApiOptions expects DatabaseId). */
const tid = (value: string): DatabaseId => value as DatabaseId;

const h = vi.hoisted(() => {
  return {
    widgetStore: {
      initialize: vi.fn(async () => {}),
      widgetFunctions: {} as Record<string, Record<string, unknown>>,
      coreWidgets: [] as string[],
      dependencies: {} as Record<string, string[]>,
    },
    getActiveWidgets: vi.fn(),
    fetchDrupalData: vi.fn(),
    fetchWordPressData: vi.fn(),
    invalidateWebsiteTokenAuth: vi.fn(async () => {}),
    websiteTokenGetAll: vi.fn(),
    websiteTokenCreate: vi.fn(),
    websiteTokenGetById: vi.fn(),
    websiteTokenDelete: vi.fn(),
    crudInsert: vi.fn(),
    crudUpdate: vi.fn(),
    listSchemas: vi.fn(),
  };
});

vi.mock("@src/stores/widget-store.svelte.ts", () => ({
  get widgets() {
    return h.widgetStore;
  },
  getWidgetDependencies: (name: string) => h.widgetStore.dependencies[name] ?? [],
}));

vi.mock("@src/services/content/importer/source-adapters", () => ({
  fetchDrupalData: h.fetchDrupalData,
  fetchWordPressData: h.fetchWordPressData,
}));

vi.mock("@src/databases/auth/credential-auth-cache", () => ({
  invalidateWebsiteTokenAuth: h.invalidateWebsiteTokenAuth,
}));

/** Minimal adapter surface covering what the tested namespaces touch. */
function makeAdapter(): IDBAdapter {
  return {
    collection: { listSchemas: h.listSchemas },
    crud: { insert: h.crudInsert, update: h.crudUpdate },
    system: {
      widgets: {
        getActiveWidgets: h.getActiveWidgets,
        activate: vi.fn(async () => ({ success: true })),
        deactivate: vi.fn(async () => ({ success: true })),
      },
      websiteTokens: {
        getAll: h.websiteTokenGetAll,
        create: h.websiteTokenCreate,
        getById: h.websiteTokenGetById,
        delete: h.websiteTokenDelete,
      },
      preferences: {
        getMany: vi.fn(async () => ({ success: true, data: {} })),
        set: vi.fn(async () => ({ success: true })),
      },
    },
  } as unknown as IDBAdapter;
}

/** Static widget factory record — mirrors the props WidgetsNamespace.list reads. */
function widgetFactory(
  name: string,
  opts: {
    icon?: string;
    guiSchema?: Record<string, unknown>;
    input?: string;
    display?: string;
  } = {},
): Record<string, unknown> {
  const fn: Record<string, unknown> = { Name: name, Description: `${name} description` };
  fn.Icon = opts.icon ?? "mdi:puzzle-plus";
  if (opts.guiSchema) fn.GuiSchema = opts.guiSchema;
  if (opts.input) fn.__inputComponentPath = opts.input;
  if (opts.display) fn.__displayComponentPath = opts.display;
  return fn;
}

describe("WidgetsNamespace.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.widgetStore.widgetFunctions = {};
    h.widgetStore.coreWidgets = [];
    h.widgetStore.dependencies = {};
  });

  it("orders core widgets first, then alphabetically, and derives membership fields", async () => {
    h.widgetStore.widgetFunctions = {
      VideoWidget: widgetFactory("VideoWidget", {
        icon: "mdi:video",
        guiSchema: { src: {}, muted: {} },
        input: "/video/input.svelte",
        display: "/video/display.svelte",
      }),
      CustomHero: widgetFactory("CustomHero", { input: "/hero/input.svelte" }),
      CoreWidget: widgetFactory("CoreWidget", {
        icon: "mdi:puzzle",
        guiSchema: { text: {} },
      }),
    };
    h.widgetStore.coreWidgets = ["CoreWidget"];
    h.widgetStore.dependencies = { CustomHero: ["CoreWidget"] };
    h.getActiveWidgets.mockResolvedValue({
      success: true,
      data: ["VideoWidget", { name: "CustomHero" }],
    });

    const ns = new WidgetsNamespace(makeAdapter());
    const result = await ns.list({ tenantId: tid("tenant-x") });

    expect(h.widgetStore.initialize).toHaveBeenCalledWith("tenant-x");
    expect(result.map((w) => w.name)).toEqual(["CoreWidget", "CustomHero", "VideoWidget"]);

    const core = result[0];
    expect(core).toMatchObject({
      name: "CoreWidget",
      icon: "mdi:puzzle",
      description: "CoreWidget description",
      isCore: true,
      isActive: false,
      dependencies: [],
      canDisable: false,
      hasValidation: true,
    });
    expect(core.pillar).toEqual({
      definition: {
        name: "CoreWidget",
        description: "CoreWidget description",
        icon: "mdi:puzzle",
        guiSchema: 1,
        aggregations: false,
      },
      input: { componentPath: "", exists: false },
      display: { componentPath: "", exists: false },
    });

    const hero = result[1];
    expect(hero).toMatchObject({
      name: "CustomHero",
      isCore: false,
      isActive: true,
      dependencies: ["CoreWidget"],
      canDisable: false,
      hasValidation: false,
    });
    expect(hero.pillar.definition.icon).toBe("mdi:puzzle-plus");
    expect(hero.pillar.input).toEqual({ componentPath: "/hero/input.svelte", exists: true });
    expect(hero.pillar.display).toEqual({ componentPath: "", exists: false });

    const video = result[2];
    expect(video).toMatchObject({
      name: "VideoWidget",
      isCore: false,
      isActive: true,
      canDisable: true,
      hasValidation: true,
    });
    expect(video.pillar.definition.guiSchema).toBe(2);
    expect(video.pillar.input.exists).toBe(true);
    expect(video.pillar.display.exists).toBe(true);
  });

  it("treats every widget as inactive when the adapter reports failure", async () => {
    h.widgetStore.widgetFunctions = {
      VideoWidget: widgetFactory("VideoWidget"),
      CoreWidget: widgetFactory("CoreWidget"),
    };
    h.widgetStore.coreWidgets = ["CoreWidget"];
    h.getActiveWidgets.mockResolvedValue({ success: false, data: [] });

    const ns = new WidgetsNamespace(makeAdapter());
    const result = await ns.list({ tenantId: tid("tenant-x") });

    expect(result).toHaveLength(2);
    expect(result.every((w) => w.isActive === false)).toBe(true);
  });
});

describe("ImporterNamespace.importExternal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("imports Drupal items with taxonomy/richtext mapping and resolves entity references", async () => {
    h.fetchDrupalData.mockResolvedValue({
      schema: { title: { widget: "text" } },
      items: [
        {
          id: "node-1",
          attributes: {
            title: "Hello",
            body: { value: "<p>Body</p>", format: "full_html" },
            vid: 7,
            revision_log: "published",
          },
          relationships: {
            field_tags: {
              data: [
                { type: "taxonomy_term--tags", id: "term-1" },
                { type: "taxonomy_term--tags", id: "term-2" },
                { type: "taxonomy_term--tags", id: "term-missing" },
              ],
            },
            field_category: { data: { type: "taxonomy_term--categories", id: "cat-9" } },
            field_author: { data: { type: "node--article", id: "node-2" } },
          },
        },
        {
          id: "node-2",
          attributes: { title: "Second", body: { value: "<p>2</p>" } },
          relationships: {},
        },
      ],
      _included: [
        { type: "taxonomy_term--tags", id: "term-1", attributes: { name: "News" } },
        {
          type: "taxonomy_term--tags",
          id: "term-2",
          attributes: { drupal_internal__target_id: 42 },
        },
        { type: "taxonomy_term--categories", id: "cat-9", attributes: { title: "Guides" } },
        { type: "user--user", id: "user-5", attributes: { name: "Alice" } },
      ],
    });
    h.listSchemas.mockResolvedValue({
      success: true,
      data: [{ _id: "col-articles", name: "articles" }],
    });
    h.crudInsert.mockImplementation(async (_table: string, data: Record<string, unknown>) => ({
      success: true,
      data: { _id: `dest-${String(data._importSourceId ?? "")}` },
    }));
    h.crudUpdate.mockResolvedValue({ success: true });

    const ns = new ImporterNamespace(makeAdapter());
    const result = await ns.importExternal(
      {
        sourceType: "drupal",
        sourceUrl: "https://example.test",
        contentType: "node--article",
        targetCollection: "articles",
        mapping: { title: "title", body: { target: "body" } },
      },
      { tenantId: tid("t1"), user: { _id: "u1" } },
    );

    expect(result).toEqual({
      success: true,
      imported: 2,
      errors: 0,
      resolvedRefs: 1,
      revisions: 1,
      total: 2,
    });

    const [tableArg, dataArg, optsArg] = h.crudInsert.mock.calls[0];
    expect(tableArg).toBe("collection_colarticles");
    expect(dataArg).toMatchObject({
      _importSourceId: "node-1",
      title: "Hello",
      body: "<p>Body</p>",
      bodyFormat: "full_html",
      tags: ["News", "42", "term-missing"],
      categories: ["Guides"],
      field_tags: ["term-1", "term-2", "term-missing"],
      field_category: ["cat-9"],
      field_author: ["node-2"],
    });
    expect(optsArg).toEqual({ tenantId: "t1" });

    expect(h.crudUpdate).toHaveBeenCalledTimes(1);
    const [updTable, updId, updData, updOpts] = h.crudUpdate.mock.calls[0];
    expect(updTable).toBe("collection_colarticles");
    expect(updId).toBe("dest-node-1");
    expect(updData).toEqual({ field_author: ["dest-node-2"] });
    expect(updOpts).toEqual({ tenantId: "t1" });

    const revisionCalls = h.crudInsert.mock.calls.filter(
      ([table]) => table === "content_revisions",
    );
    expect(revisionCalls).toHaveLength(1);
    const [, revPayload, revOpts] = revisionCalls[0];
    expect(revPayload).toMatchObject({
      contentId: "dest-node-1",
      version: 7,
      commitMessage: "published",
      authorId: "u1",
    });
    expect(JSON.parse(revPayload.data)).toEqual({ title: "Hello", body: "<p>Body</p>" });
    expect(revOpts).toEqual({ tenantId: "t1", skipMeta: true });
  });

  it("imports WordPress items as flat documents", async () => {
    h.fetchWordPressData.mockResolvedValue({
      schema: {},
      items: [{ id: "w1", title: "Hello" }],
    });
    h.listSchemas.mockResolvedValue({
      success: true,
      data: [{ _id: "col-posts", name: "posts" }],
    });
    h.crudInsert.mockResolvedValue({ success: true, data: { _id: "dest-w1" } });

    const ns = new ImporterNamespace(makeAdapter());
    const result = await ns.importExternal(
      {
        sourceType: "wordpress",
        sourceUrl: "https://example.test",
        contentType: "post",
        targetCollection: "posts",
        mapping: { title: "title" },
      },
      { tenantId: tid("t1"), user: { _id: "u1" } },
    );

    expect(result).toEqual({
      success: true,
      imported: 1,
      errors: 0,
      resolvedRefs: 0,
      revisions: 0,
      total: 1,
    });
    const [tableArg, dataArg] = h.crudInsert.mock.calls[0];
    expect(tableArg).toBe("collection_colposts");
    expect(dataArg).toMatchObject({ _importSourceId: "w1", title: "Hello" });
    expect(h.crudUpdate).not.toHaveBeenCalled();
  });

  it("returns the mapping and sample data without importing on dryRun", async () => {
    h.fetchWordPressData.mockResolvedValue({
      schema: {},
      items: [{ id: "w1" }, { id: "w2" }, { id: "w3" }, { id: "w4" }],
    });

    const ns = new ImporterNamespace(makeAdapter());
    const result = await ns.importExternal(
      {
        sourceType: "wordpress",
        sourceUrl: "https://example.test",
        contentType: "post",
        targetCollection: "posts",
        mapping: { title: "title" },
        dryRun: true,
      },
      { tenantId: tid("t1"), user: { _id: "u1" } },
    );

    expect(result).toMatchObject({
      success: true,
      dryRun: true,
      mapping: { title: "title" },
      sampleData: [{ id: "w1" }, { id: "w2" }, { id: "w3" }],
    });
    expect(h.crudInsert).not.toHaveBeenCalled();
    expect(h.crudUpdate).not.toHaveBeenCalled();
  });

  it("counts per-item failures as errors without aborting the import", async () => {
    h.fetchWordPressData.mockResolvedValue({
      schema: {},
      items: [
        { id: "w1", title: "ok" },
        { id: "w2", title: "bad" },
      ],
    });
    h.listSchemas.mockResolvedValue({
      success: true,
      data: [{ _id: "col-posts", name: "posts" }],
    });
    h.crudInsert.mockImplementation(async (_table: string, data: Record<string, unknown>) => {
      if (data.title === "bad") throw new Error("insert failed");
      return { success: true, data: { _id: "dest-w1" } };
    });

    const ns = new ImporterNamespace(makeAdapter());
    const result = await ns.importExternal(
      {
        sourceType: "wordpress",
        sourceUrl: "https://example.test",
        contentType: "post",
        targetCollection: "posts",
        mapping: { title: "title" },
      },
      { tenantId: tid("t1"), user: { _id: "u1" } },
    );

    expect(result).toEqual({
      success: true,
      imported: 1,
      errors: 1,
      resolvedRefs: 0,
      revisions: 0,
      total: 2,
    });
  });
});

describe("WebsiteTokensNamespace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("paginates the token list with skip/totalPages derived from page/limit", async () => {
    h.websiteTokenGetAll.mockResolvedValue({
      success: true,
      data: { data: [{ _id: "t1" }], total: 25 },
    });

    const ns = new WebsiteTokensNamespace(makeAdapter());
    const result = await ns.list({
      tenantId: tid("tenant-1"),
      page: 3,
      limit: 10,
      sort: "name",
      order: "asc",
    });

    expect(h.websiteTokenGetAll).toHaveBeenCalledWith(
      { limit: 10, skip: 20, sort: "name", order: "asc" },
      "tenant-1",
    );
    expect(result).toEqual({
      data: [{ _id: "t1" }],
      pagination: { totalItems: 25, page: 3, limit: 10, totalPages: 3 },
    });
  });

  it("creates a token with an sv_ prefix and returns the plaintext once", async () => {
    h.websiteTokenCreate.mockImplementation(async (payload: Record<string, unknown>) => ({
      success: true,
      data: {
        _id: "tok-1",
        name: payload.name,
        permissions: payload.permissions,
        createdBy: payload.createdBy,
      },
    }));

    const ns = new WebsiteTokensNamespace(makeAdapter());
    const result = await ns.create({
      name: "CI Token",
      permissions: ["content:read"],
      user: { _id: "user-1" },
      tenantId: tid("tenant-1"),
    });

    expect(result.token).toMatch(/^sv_[0-9a-f]{48}$/);
    expect(result).toMatchObject({
      _id: "tok-1",
      name: "CI Token",
      permissions: ["content:read"],
      createdBy: "user-1",
    });

    const [payload, tenantId] = h.websiteTokenCreate.mock.calls[0];
    expect(payload).toMatchObject({
      name: "CI Token",
      token: result.token,
      createdBy: "user-1",
      permissions: ["content:read"],
      expiresAt: undefined,
    });
    expect(typeof payload.updatedAt).toBe("string");
    expect(tenantId).toBe("tenant-1");
  });

  it("invalidates the token auth cache for each deleted token", async () => {
    h.websiteTokenGetById.mockResolvedValue({ success: true, data: { token: "hashed-1" } });
    h.websiteTokenDelete.mockResolvedValue({ success: true });

    const ns = new WebsiteTokensNamespace(makeAdapter());
    const result = await ns.deleteMany(["a", "b"], { tenantId: tid("tenant-1") });

    expect(result).toEqual({ deletedCount: 2 });
    expect(h.invalidateWebsiteTokenAuth).toHaveBeenCalledTimes(2);
    expect(h.invalidateWebsiteTokenAuth).toHaveBeenCalledWith("a", "tenant-1", "hashed-1");
    expect(h.invalidateWebsiteTokenAuth).toHaveBeenCalledWith("b", "tenant-1", "hashed-1");
  });

  it("returns zero without touching the adapter for an empty id list", async () => {
    const ns = new WebsiteTokensNamespace(makeAdapter());
    const result = await ns.deleteMany([], { tenantId: tid("tenant-1") });

    expect(result).toEqual({ deletedCount: 0 });
    expect(h.websiteTokenDelete).not.toHaveBeenCalled();
    expect(h.invalidateWebsiteTokenAuth).not.toHaveBeenCalled();
  });
});
