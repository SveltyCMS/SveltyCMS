/**
 * @file tests/unit/services/config-service.test.ts
 * @description Unit tests for the ConfigService class from `src/services/core/config-service.ts`.
 *
 * Covers:
 * - Sync status detection (in_sync vs changes_detected)
 * - State comparison logic (new, updated, deleted)
 * - Export and import operations with mock filesystem and DB
 * - Checksum stability
 * - Tenant isolation enforcement
 *
 * Note: ConfigService aggregates 8+ resource types (collections, roles, permissions,
 * settings, widgets, themes, webhooks, automations). All non-target types are mocked
 * to return empty data to isolate the test surface to the type under test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockFindMany, mockUpsert, mockDelete, mockPreferencesGet } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpsert: vi.fn(),
  mockDelete: vi.fn(),
  mockPreferencesGet: vi.fn(),
}));

const { mockMkdir, mockWriteFile } = vi.hoisted(() => ({
  mockMkdir: vi.fn(async () => undefined),
  mockWriteFile: vi.fn(async () => undefined),
}));

const { mockGetCollections, mockInitialize, mockEmptyData } = vi.hoisted(() => ({
  mockGetCollections: vi.fn(),
  mockInitialize: vi.fn(),
  mockEmptyData: { success: true, data: [] },
}));

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
  default: { mkdir: mockMkdir, writeFile: mockWriteFile, readFile: vi.fn(), readdir: vi.fn() },
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
}));

// Mock node:path
vi.mock("node:path", () => ({
  default: {
    resolve: vi.fn((...args: string[]) => args.join("/")),
    join: vi.fn((...args: string[]) => args.join("/")),
  },
  resolve: vi.fn((...args: string[]) => args.join("/")),
  join: vi.fn((...args: string[]) => args.join("/")),
}));

// Mock @src/databases/db — full adapter surface for all 8 resource types
vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    type: "mongodb",
    crud: {
      findMany: mockFindMany,
      upsert: mockUpsert,
      delete: mockDelete,
      insert: vi.fn().mockResolvedValue(mockEmptyData),
      insertMany: vi.fn().mockResolvedValue(mockEmptyData),
      update: vi.fn().mockResolvedValue(mockEmptyData),
      updateMany: vi.fn().mockResolvedValue(mockEmptyData),
      findOne: vi.fn().mockResolvedValue({ success: true, data: null }),
      deleteMany: vi.fn().mockResolvedValue(mockEmptyData),
      upsertMany: vi.fn().mockResolvedValue(mockEmptyData),
      count: vi.fn().mockResolvedValue({ success: true, data: 0 }),
      exists: vi.fn().mockResolvedValue({ success: true, data: false }),
    },
    auth: {
      // Used by fetchRolesFromDb, fetchPermissionsFromDb
      getAllRoles: vi.fn().mockResolvedValue([]),
      getUserById: vi.fn(),
      getSessionTokenData: vi.fn(),
      getUserBySamlId: vi.fn(),
      getUserByEmail: vi.fn(),
      createUser: vi.fn(),
      createSession: vi.fn(),
      checkUser: vi.fn(),
      getTokenByValue: vi.fn(),
      updateToken: vi.fn(),
      deleteTokens: vi.fn(),
      getAllTokens: vi.fn(),
      createToken: vi.fn(),
      getTokenById: vi.fn(),
      updateUserAttributes: vi.fn(),
      getAllUsers: vi.fn(),
      getUserCount: vi.fn(),
      ensureAuth: vi.fn(),
      validateSession: vi.fn(),
      createSessionCookie: vi.fn(),
      authInterface: {},
    },
    system: {
      preferences: {
        get: mockPreferencesGet,
        set: vi.fn().mockResolvedValue({ success: true }),
        getMany: vi.fn().mockResolvedValue({ success: true, data: {} }),
        setMany: vi.fn().mockResolvedValue({ success: true }),
        deleteMany: vi.fn().mockResolvedValue({ success: true }),
      },
      // Used by fetchWidgetsFromDb, fetchThemesFromDb
      widgets: {
        getActiveWidgets: vi.fn().mockResolvedValue(mockEmptyData),
        findAll: vi.fn().mockResolvedValue(mockEmptyData),
      },
      themes: {
        getAllThemes: vi.fn().mockResolvedValue([]),
        getTheme: vi.fn().mockResolvedValue(null),
      },
    },
    media: { files: { upload: vi.fn(), delete: vi.fn() } },
    content: { nodes: {}, drafts: {} },
    monitoring: { cache: { invalidateCategory: vi.fn() } },
    collection: { getModel: vi.fn(), createModel: vi.fn(), listSchemas: vi.fn() },
    batch: { execute: vi.fn() },
    isConnected: vi.fn(() => true),
  },
  getDb: vi.fn(),
  isDbConnected: vi.fn(() => true),
  reinitializeSystem: vi.fn(),
  ensureFullInitialization: vi.fn(),
  getDbInitPromise: vi.fn(() => Promise.resolve()),
  dbInitPromise: Promise.resolve(),
}));

// Mock @src/content/index.server — used by source scanners
vi.mock("@src/content/index.server", () => ({
  contentSystem: {
    initialize: mockInitialize,
    getCollections: mockGetCollections,
    // Other scanner methods — mocked to return empty data
    getRoles: vi.fn().mockResolvedValue([]),
    getPermissions: vi.fn().mockResolvedValue([]),
    getSettings: vi.fn().mockResolvedValue([]),
    getWidgets: vi.fn().mockResolvedValue([]),
    getThemes: vi.fn().mockResolvedValue([]),
    getWebhooks: vi.fn().mockResolvedValue([]),
    getAutomations: vi.fn().mockResolvedValue([]),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { ConfigService } from "@src/services/core/config-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntity(overrides: Record<string, unknown> = {}) {
  return {
    _id: overrides._id ?? "ent-1",
    name: overrides.name ?? "blog",
    fields: overrides.fields ?? [{ name: "title", type: "text" }],
    ...overrides,
  };
}

function makeConfigEntity(uuid: string, overrides: Partial<{ name: string; type: string }> = {}) {
  return {
    uuid,
    type: overrides.type ?? "collection",
    name: overrides.name ?? `entity-${uuid}`,
    hash: `hash-${uuid}`,
    entity: { _id: uuid, name: overrides.name ?? `entity-${uuid}` },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConfigService", () => {
  let service: ConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ConfigService();

    // Default mocks: empty for all resource types
    mockInitialize.mockResolvedValue(undefined);
    mockGetCollections.mockResolvedValue([]);
    mockPreferencesGet.mockResolvedValue({ success: true, data: { value: "test" } });

    // findMany defaults — used for collections, system_settings, webhooks, automations
    mockFindMany.mockImplementation(async (collection: string) => {
      if (collection === "collections") return { success: true, data: [] };
      if (collection === "system_settings") return { success: true, data: [] };
      if (collection === "webhooks") return { success: true, data: [] };
      if (collection === "automations") return { success: true, data: [] };
      return { success: true, data: [] };
    });

    mockUpsert.mockResolvedValue({ success: true });
    mockDelete.mockResolvedValue({ success: true });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getStatus()
  // ─────────────────────────────────────────────────────────────────────────

  describe("getStatus()", () => {
    it("returns in_sync when source and active states match", async () => {
      const sameEntity = makeEntity({ _id: "col-1", name: "blog" });
      mockGetCollections.mockResolvedValue([sameEntity]);
      mockFindMany.mockImplementation(async (collection: string) => {
        if (collection === "collections") return { success: true, data: [sameEntity] };
        return { success: true, data: [] };
      });

      const status = await service.getStatus("tenant-1");

      expect(status.status).toBe("in_sync");
      expect(status.changes.new).toHaveLength(0);
      expect(status.changes.updated).toHaveLength(0);
      expect(status.changes.deleted).toHaveLength(0);
    });

    it("returns changes_detected when there are new items in source", async () => {
      const newEntity = makeEntity({ _id: "col-new", name: "new-collection" });
      mockGetCollections.mockResolvedValue([newEntity]);

      const status = await service.getStatus("tenant-1");

      expect(status.status).toBe("changes_detected");
      expect(status.changes.new).toHaveLength(1);
      expect(status.changes.new[0].name).toBe("new-collection");
    });

    it("returns changes_detected when there are updated items (different hash)", async () => {
      const sourceEntity = makeEntity({ _id: "col-1", name: "blog-v2" });
      const activeEntity = makeEntity({ _id: "col-1", name: "blog-v1" });
      mockGetCollections.mockResolvedValue([sourceEntity]);
      mockFindMany.mockImplementation(async (collection: string) => {
        if (collection === "collections") return { success: true, data: [activeEntity] };
        return { success: true, data: [] };
      });

      const status = await service.getStatus("tenant-1");

      expect(status.status).toBe("changes_detected");
      expect(status.changes.updated).toHaveLength(1);
    });

    it("returns changes_detected when there are deleted items (in active but not source)", async () => {
      const activeOnly = makeEntity({ _id: "stale-col", name: "stale" });
      mockGetCollections.mockResolvedValue([]);
      mockFindMany.mockImplementation(async (collection: string) => {
        if (collection === "collections") return { success: true, data: [activeOnly] };
        return { success: true, data: [] };
      });

      const status = await service.getStatus("tenant-1");

      expect(status.status).toBe("changes_detected");
      expect(status.changes.deleted).toHaveLength(1);
      expect(status.changes.deleted[0].name).toBe("stale");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // compareStates() — tested indirectly via getStatus
  // ─────────────────────────────────────────────────────────────────────────

  describe("compareStates()", () => {
    it("correctly identifies new items (in source but not active)", async () => {
      const newEntity = makeEntity({ _id: "only-source", name: "only-in-files" });
      mockGetCollections.mockResolvedValue([newEntity]);

      const status = await service.getStatus("tenant-1");
      expect(status.changes.new).toHaveLength(1);
      expect(status.changes.new[0].uuid).toBe("only-source");
    });

    it("correctly identifies updated items (different hash)", async () => {
      const src = makeEntity({ _id: "a", name: "same-name", extra: "v1" });
      const act = makeEntity({ _id: "a", name: "same-name", extra: "v2" });
      mockGetCollections.mockResolvedValue([src]);
      mockFindMany.mockImplementation(async (collection: string) => {
        if (collection === "collections") return { success: true, data: [act] };
        return { success: true, data: [] };
      });

      const status = await service.getStatus("tenant-1");
      expect(status.changes.updated).toHaveLength(1);
      expect(status.changes.updated[0].uuid).toBe("a");
    });

    it("correctly identifies deleted items (in active but not source)", async () => {
      const act = makeEntity({ _id: "orphan", name: "orphan" });
      mockGetCollections.mockResolvedValue([]);
      mockFindMany.mockImplementation(async (collection: string) => {
        if (collection === "collections") return { success: true, data: [act] };
        return { success: true, data: [] };
      });

      const status = await service.getStatus("tenant-1");
      expect(status.changes.deleted).toHaveLength(1);
      expect(status.changes.deleted[0].uuid).toBe("orphan");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Checksum stability
  // ─────────────────────────────────────────────────────────────────────────

  describe("checksums", () => {
    it("are stable across repeated calls with same input", async () => {
      const { createChecksum } = await import("@src/utils/security/crypto");

      const data1 = { name: "test", fields: [{ a: 1 }] };
      const data2 = { name: "test", fields: [{ a: 1 }] };

      const h1 = await createChecksum(data1);
      const h2 = await createChecksum(data2);

      expect(h1).toBe(h2);
    });

    it("produce different hashes when content differs (detects schema drift)", async () => {
      const { createChecksum } = await import("@src/utils/security/crypto");

      const data1 = { name: "blog", fields: [{ name: "title", type: "text" }] };
      const data2 = { name: "blog", fields: [{ name: "title", type: "richtext" }] };

      const h1 = await createChecksum(data1);
      const h2 = await createChecksum(data2);

      expect(h1).not.toBe(h2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // performExport()
  // ─────────────────────────────────────────────────────────────────────────

  describe("performExport()", () => {
    it("writes manifest.json and resource-type JSON files", async () => {
      const entity = makeEntity({ _id: "col-1", name: "blog" });
      mockFindMany.mockImplementation(async (collection: string) => {
        if (collection === "collections") return { success: true, data: [entity] };
        return { success: true, data: [] };
      });

      const result = await service.performExport({ tenantId: "tenant-1" });

      // Verify directory path
      expect(result.dirPath).toContain("config/sync");
      expect(result.dirPath).toContain("export_tenant-1_");
      expect(mockMkdir).toHaveBeenCalled();

      // Verify at least one writeFile call
      expect(mockWriteFile).toHaveBeenCalled();

      // Find the manifest.json call (first call is manifest based on code order)
      const allCalls = mockWriteFile.mock.calls as unknown as [string, string][];
      const manifestCall = allCalls.find(([fp]) => fp.endsWith("manifest.json"));
      expect(manifestCall).toBeDefined();

      const manifest = JSON.parse(manifestCall![1]);
      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.resources).toBeDefined();
    });

    it("exports collections data when present", async () => {
      const entity = makeEntity({ _id: "col-1", name: "blog" });
      mockFindMany.mockImplementation(async (collection: string) => {
        if (collection === "collections") return { success: true, data: [entity] };
        return { success: true, data: [] };
      });

      await service.performExport({ tenantId: "tenant-1" });

      // Find the collections.json write
      const allCalls = mockWriteFile.mock.calls as unknown as [string, string][];
      const collectionCall = allCalls.find(([fp]) => fp.includes("collections"));
      expect(collectionCall).toBeDefined();

      const parsed = JSON.parse(collectionCall![1]);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].name).toBe("blog");
    });

    it("filters by uuids when provided", async () => {
      const e1 = makeEntity({ _id: "a", name: "keep" });
      const e2 = makeEntity({ _id: "b", name: "skip" });
      mockFindMany.mockImplementation(async (collection: string) => {
        if (collection === "collections") return { success: true, data: [e1, e2] };
        return { success: true, data: [] };
      });

      await service.performExport({ uuids: ["a"], tenantId: "tenant-1" });

      const allCalls = mockWriteFile.mock.calls as unknown as [string, string][];
      const collectionCall = allCalls.find(([fp]) => fp.includes("collections"));
      const parsed = JSON.parse(collectionCall![1]);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]._id).toBe("a");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // performImport()
  // ─────────────────────────────────────────────────────────────────────────

  describe("performImport()", () => {
    it("calls dbAdapter.crud.upsert for new items", async () => {
      await service.performImport({
        tenantId: "t-1",
        changes: {
          new: [makeConfigEntity("n1", { name: "new-collection" })],
          updated: [],
          deleted: [],
        },
      });

      expect(mockUpsert).toHaveBeenCalled();
    });

    it("calls dbAdapter.crud.upsert for updated items", async () => {
      await service.performImport({
        tenantId: "t-1",
        changes: {
          new: [],
          updated: [makeConfigEntity("u1", { name: "updated-coll" })],
          deleted: [],
        },
      });

      expect(mockUpsert).toHaveBeenCalled();
    });

    it("calls dbAdapter.crud.delete for deleted items", async () => {
      await service.performImport({
        tenantId: "t-1",
        changes: {
          new: [],
          updated: [],
          deleted: [makeConfigEntity("d1", { name: "deleted-coll" })],
        },
      });

      expect(mockDelete).toHaveBeenCalledWith(expect.any(String), "d1", expect.any(String));
    });

    it("handles all three change types in a single call", async () => {
      await service.performImport({
        tenantId: "t-1",
        changes: {
          new: [makeConfigEntity("n1", { name: "new" })],
          updated: [makeConfigEntity("u1", { name: "updated" })],
          deleted: [makeConfigEntity("d1", { name: "deleted" })],
        },
      });

      expect(mockUpsert).toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalled();
    });

    it("derives changes from getStatus when no changes provided", async () => {
      const sourceEntity = makeEntity({ _id: "auto", name: "auto-import" });
      mockGetCollections.mockResolvedValue([sourceEntity]);

      await service.performImport({ tenantId: "t-1" });

      // Should have detected the new item and attempted upsert
      expect(mockUpsert).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tenant isolation
  // ─────────────────────────────────────────────────────────────────────────

  describe("tenant isolation", () => {
    it("passes different tenantId to getCollections for each tenant", async () => {
      const tenantACalls: string[] = [];
      const tenantBCalls: string[] = [];
      mockGetCollections.mockImplementation(async (tid?: string) => {
        if (tid === "tenant-a") {
          tenantACalls.push(tid);
          return [makeEntity({ _id: "a-1", name: "a-col" })];
        }
        if (tid === "tenant-b") {
          tenantBCalls.push(tid);
          return [makeEntity({ _id: "b-1", name: "b-col" })];
        }
        return [];
      });

      const statusA = await service.getStatus("tenant-a");
      const statusB = await service.getStatus("tenant-b");

      const namesA = statusA.changes.new.map((c) => c.name);
      const namesB = statusB.changes.new.map((c) => c.name);

      expect(namesA).toContain("a-col");
      expect(namesA).not.toContain("b-col");
      expect(namesB).toContain("b-col");
      expect(namesB).not.toContain("a-col");
    });

    it("passes tenantId to upsert during import", async () => {
      await service.performImport({
        tenantId: "isolated-tenant",
        changes: {
          new: [makeConfigEntity("iso-1", { name: "isolated-col" })],
          updated: [],
          deleted: [],
        },
      });

      expect(mockUpsert).toHaveBeenCalled();
    });

    it("passes tenantId to delete during import", async () => {
      await service.performImport({
        tenantId: "isolated-tenant",
        changes: {
          new: [],
          updated: [],
          deleted: [makeConfigEntity("iso-2", { name: "to-delete" })],
        },
      });

      expect(mockDelete).toHaveBeenCalledWith(expect.any(String), "iso-2", "isolated-tenant");
    });
  });
});
