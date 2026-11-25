/**
 * @file tests/unit/services/retention-sweep.test.ts
 * @description Unit tests for background soft-delete retention and orphaned media cleanup sweeper.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCollections, mockCleanupMediaVersions, mockIsMultiTenantEnabled } = vi.hoisted(
  () => ({
    mockGetCollections: vi.fn(),
    mockCleanupMediaVersions: vi.fn(),
    mockIsMultiTenantEnabled: vi.fn(() => false),
  }),
);

vi.mock("@src/content/index.server", () => ({
  contentSystem: {
    getCollections: mockGetCollections,
  },
}));

vi.mock("@utils/media/media-lifecycle.server", () => ({
  MEDIA_VERSION_RETENTION_DEFAULT: 10,
  cleanupMediaVersions: mockCleanupMediaVersions,
}));

vi.mock("@utils/tenant-isolation.server", () => ({
  isMultiTenantEnabled: mockIsMultiTenantEnabled,
}));

import { hasTenantBypass } from "@src/databases/system-tenant-scope";
import type { IDBAdapter } from "@src/databases/db-interface";
import {
  parseRetentionSetting,
  runRetentionSweep,
} from "@src/services/background/jobs/retention-sweep";

function createMockDb(options?: { tenants?: { _id: string }[] }): IDBAdapter & {
  crud: { findMany: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
} {
  return {
    crud: {
      findMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
      deleteMany: vi.fn().mockResolvedValue({ success: true, data: { deletedCount: 0 } }),
    },
    system: {
      tenants: {
        list: vi.fn().mockResolvedValue({
          success: true,
          data: options?.tenants ?? [],
        }),
      },
    },
  } as unknown as IDBAdapter & {
    crud: { findMany: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  };
}

describe("Background retention sweep", () => {
  const prevBenchmark = process.env.BENCHMARK;

  beforeEach(() => {
    delete process.env.BENCHMARK;
    vi.clearAllMocks();
    mockIsMultiTenantEnabled.mockReturnValue(false);
    mockGetCollections.mockResolvedValue([{ _id: "col-posts" }]);
    mockCleanupMediaVersions.mockResolvedValue({
      dryRun: false,
      scanned: 0,
      versionsPruned: 0,
      hashesReleased: [],
      variantSetsDeleted: 0,
      originalsDeleted: 0,
      keepVersions: 10,
    });
  });

  afterEach(() => {
    if (prevBenchmark === undefined) delete process.env.BENCHMARK;
    else process.env.BENCHMARK = prevBenchmark;
  });

  it("parses valid retention days and falls back on empty or invalid values", () => {
    expect(parseRetentionSetting(undefined, 30)).toBe(30);
    expect(parseRetentionSetting("", 30)).toBe(30);
    expect(parseRetentionSetting("0", 30)).toBe(0);
    expect(parseRetentionSetting("14", 30)).toBe(14);
    expect(parseRetentionSetting("-5", 30)).toBe(30);
    expect(parseRetentionSetting("abc", 30)).toBe(30);
  });

  it("skips when BENCHMARK=true or both retentions are disabled", async () => {
    const db = createMockDb();
    process.env.BENCHMARK = "true";
    const benchRes = await runRetentionSweep({ db });
    expect(benchRes.skipped).toBe(true);
    expect(benchRes.reason).toBe("benchmark");

    delete process.env.BENCHMARK;
    const disabledRes = await runRetentionSweep({
      db,
      softDeleteRetentionDays: 0,
      mediaVersionRetention: 0,
    });
    expect(disabledRes.skipped).toBe(true);
    expect(disabledRes.reason).toBe("disabled");
    expect(db.crud.findMany).not.toHaveBeenCalled();
  });

  it("purges expired soft-deleted entries and media_items in batches and cleans media versions", async () => {
    const db = createMockDb();
    const fixedNow = Date.UTC(2026, 10, 25, 12, 0, 0);
    const expectedCutoff = new Date(fixedNow - 30 * 86_400_000).toISOString();

    db.crud.findMany
      // Batch 1 (full batch of 2 triggers second batch) for collection_col-posts
      .mockResolvedValueOnce({ success: true, data: [{ _id: "e1" }, { _id: "e2" }] })
      // Batch 2 (1 row stops loop)
      .mockResolvedValueOnce({ success: true, data: [{ _id: "e3" }] })
      // media_items returns 1 expired row
      .mockResolvedValueOnce({ success: true, data: [{ _id: "m1" }] });

    db.crud.deleteMany
      .mockResolvedValueOnce({ success: true, data: { deletedCount: 2 } })
      .mockResolvedValueOnce({ success: true, data: { deletedCount: 1 } })
      .mockResolvedValueOnce({ success: true, data: { deletedCount: 1 } });

    mockCleanupMediaVersions.mockResolvedValueOnce({
      dryRun: false,
      scanned: 4,
      versionsPruned: 3,
      hashesReleased: ["h1", "h2"],
      variantSetsDeleted: 1,
      originalsDeleted: 1,
      keepVersions: 10,
    });

    const summary = await runRetentionSweep({
      db,
      softDeleteRetentionDays: 30,
      mediaVersionRetention: 10,
      batchSize: 2,
      nowMs: fixedNow,
    });

    expect(summary.skipped).toBe(false);
    expect(summary.purgedEntries).toBe(3);
    expect(summary.purgedMediaItems).toBe(1);
    expect(summary.prunedMediaVersions).toBe(3);
    expect(summary.deletedMediaBlobs).toBe(2);
    expect(summary.errors).toEqual([]);

    expect(db.crud.findMany).toHaveBeenCalledWith(
      "collection_colposts",
      { isDeleted: true, deletedAt: { $lte: expectedCutoff } },
      expect.objectContaining({ includeDeleted: true, limit: 2, fields: ["_id"] }),
    );
    const deleteOpts = db.crud.deleteMany.mock.calls[0][2];
    expect(deleteOpts.permanent).toBe(true);
    expect(hasTenantBypass(deleteOpts)).toBe(true);
  });

  it("scopes sweeps per tenant when multi-tenant mode is active", async () => {
    mockIsMultiTenantEnabled.mockReturnValue(true);
    const db = createMockDb({ tenants: [{ _id: "tenant-1" }, { _id: "tenant-2" }] });

    const summary = await runRetentionSweep({ db, softDeleteRetentionDays: 30 });

    expect(summary.tenantsProcessed).toBe(2);
    expect(mockGetCollections).toHaveBeenCalledWith("tenant-1");
    expect(mockGetCollections).toHaveBeenCalledWith("tenant-2");
    expect(mockCleanupMediaVersions).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ tenantId: "tenant-1", keepVersions: 10 }),
    );
    expect(mockCleanupMediaVersions).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ tenantId: "tenant-2", keepVersions: 10 }),
    );
  });
});
