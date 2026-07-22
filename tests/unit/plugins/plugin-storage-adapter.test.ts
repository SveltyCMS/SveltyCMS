/**
 * @file tests/unit/plugins/plugin-storage-adapter.test.ts
 * @description Unit tests for PluginStorageAdapterImpl CRUD + filter helper.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  matchesPluginStorageFilter,
  normalizeStorageRecord,
  PluginStorageAdapterImpl,
  PLUGIN_STORAGE_COLLECTION,
} from "@src/plugins/storage/plugin-storage-adapter";
import type { StorageRecord } from "@src/plugins/storage/types";

function mockDb(overrides: Record<string, any> = {}) {
  return {
    crud: {
      insert: vi.fn(),
      findOne: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
      ...overrides,
    },
  } as any;
}

describe("normalizeStorageRecord", () => {
  it("parses JSON string data from SQLite-style rows", () => {
    const rec = normalizeStorageRecord({
      _id: "1",
      plugin: "seo",
      collectionName: "r",
      data: '{"score":95}',
    });
    expect(rec?.data).toEqual({ score: 95 });
  });

  it("parses double-encoded JSON (stringify + drizzle json mode)", () => {
    const rec = normalizeStorageRecord({
      _id: "1",
      plugin: "seo",
      collectionName: "r",
      data: JSON.stringify(JSON.stringify({ score: 95 })),
    });
    expect(rec?.data).toEqual({ score: 95 });
  });

  it("passes through object data", () => {
    const rec = normalizeStorageRecord({
      _id: "1",
      plugin: "seo",
      collectionName: "r",
      data: { score: 10 },
    });
    expect(rec?.data).toEqual({ score: 10 });
  });
});

describe("matchesPluginStorageFilter", () => {
  const rec: StorageRecord = {
    _id: "1",
    plugin: "seo",
    collectionName: "reports",
    data: { score: 90, url: "https://a.test" },
    createdAt: "2026-01-01T00:00:00.000Z" as any,
    updatedAt: "2026-01-01T00:00:00.000Z" as any,
  };

  it("matches empty filter", () => {
    expect(matchesPluginStorageFilter(rec)).toBe(true);
    expect(matchesPluginStorageFilter(rec, {})).toBe(true);
  });

  it("matches data fields by equality", () => {
    expect(matchesPluginStorageFilter(rec, { score: 90 })).toBe(true);
    expect(matchesPluginStorageFilter(rec, { score: 10 })).toBe(false);
  });

  it("matches top-level fields", () => {
    expect(matchesPluginStorageFilter(rec, { plugin: "seo" })).toBe(true);
    expect(matchesPluginStorageFilter(rec, { plugin: "other" })).toBe(false);
  });
});

describe("PluginStorageAdapterImpl", () => {
  let db: ReturnType<typeof mockDb>;
  let adapter: PluginStorageAdapterImpl;

  beforeEach(() => {
    db = mockDb();
    adapter = new PluginStorageAdapterImpl(db);
  });

  it("createRecord inserts into plugin_storage", async () => {
    const created = {
      _id: "r1",
      plugin: "seo",
      collectionName: "reports",
      data: { score: 1 },
      createdAt: "t",
      updatedAt: "t",
    };
    db.crud.insert.mockResolvedValue({ success: true, data: created });

    const result = await adapter.createRecord(
      "seo",
      "reports",
      { score: 1 },
      {
        tenantId: "ten-1",
      },
    );

    expect(result._id).toBe("r1");
    expect(db.crud.insert).toHaveBeenCalledWith(
      PLUGIN_STORAGE_COLLECTION,
      expect.objectContaining({
        plugin: "seo",
        collectionName: "reports",
        data: { score: 1 },
      }),
      expect.objectContaining({ tenantId: "ten-1" }),
    );
  });

  it("createRecord rejects empty plugin/collection", async () => {
    await expect(adapter.createRecord("", "c", {})).rejects.toThrow(/required/i);
  });

  it("getRecord scopes by plugin + collection + id", async () => {
    db.crud.findOne.mockResolvedValue({
      success: true,
      data: { _id: "r1", plugin: "seo", collectionName: "reports", data: {} },
    });
    const row = await adapter.getRecord("seo", "reports", "r1");
    expect(row?._id).toBe("r1");
    expect(db.crud.findOne).toHaveBeenCalledWith(
      PLUGIN_STORAGE_COLLECTION,
      expect.objectContaining({ _id: "r1", plugin: "seo", collectionName: "reports" }),
      expect.any(Object),
    );
  });

  it("getRecord returns null when missing", async () => {
    db.crud.findOne.mockResolvedValue({ success: true, data: null });
    expect(await adapter.getRecord("seo", "reports", "missing")).toBeNull();
  });

  it("listRecords paginates without filter", async () => {
    db.crud.count.mockResolvedValue({ success: true, data: 2 });
    db.crud.findMany.mockResolvedValue({
      success: true,
      data: [
        { _id: "a", plugin: "seo", collectionName: "r", data: { n: 1 } },
        { _id: "b", plugin: "seo", collectionName: "r", data: { n: 2 } },
      ],
    });
    const page = await adapter.listRecords("seo", "r", { limit: 10, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.data).toHaveLength(2);
  });

  it("listRecords applies in-memory data filter", async () => {
    db.crud.findMany.mockResolvedValue({
      success: true,
      data: [
        { _id: "a", plugin: "seo", collectionName: "r", data: { status: "ok" } },
        { _id: "b", plugin: "seo", collectionName: "r", data: { status: "fail" } },
      ],
    });
    const page = await adapter.listRecords("seo", "r", {
      filter: { status: "ok" },
      limit: 10,
    });
    expect(page.total).toBe(1);
    expect(page.data[0]?._id).toBe("a");
  });

  it("deleteRecord returns false when missing", async () => {
    db.crud.findOne.mockResolvedValue({ success: true, data: null });
    expect(await adapter.deleteRecord("seo", "r", "x")).toBe(false);
    expect(db.crud.delete).not.toHaveBeenCalled();
  });

  it("deleteRecord permanently deletes when found", async () => {
    db.crud.findOne.mockResolvedValue({
      success: true,
      data: { _id: "x", plugin: "seo", collectionName: "r", data: {} },
    });
    db.crud.delete.mockResolvedValue({ success: true });
    expect(await adapter.deleteRecord("seo", "r", "x")).toBe(true);
    expect(db.crud.delete).toHaveBeenCalledWith(
      PLUGIN_STORAGE_COLLECTION,
      "x",
      expect.objectContaining({ permanent: true }),
    );
  });
});
