/**
 * @file tests/unit/media/media-lifecycle.test.ts
 * @description Reference-aware version pruning, orphan release, and derivative
 * status reconciliation.
 *
 * The storage adapter and variant scheduler are boundary mocks: this suite
 * asserts the decision logic (which hash may be released, which status is
 * derived, when a re-queue happens), not encoding.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";

const storage = vi.hoisted(() => ({
  removed: [] as string[],
  variantsDeleted: [] as string[],
}));

const scheduler = vi.hoisted(() => ({
  scheduled: [] as Array<{ hash: string; relPath: string }>,
}));

vi.mock("@src/services/media/image-variant-storage", () => ({
  deleteAllVariants: async (hash: string) => {
    storage.variantsDeleted.push(hash);
  },
}));

vi.mock("@utils/media/storage-adapters", () => ({
  getStorageAdapter: () => ({
    remove: async (relPath: string) => {
      storage.removed.push(relPath);
    },
  }),
}));

vi.mock("@utils/media/variant-job-scheduler.server", () => ({
  scheduleVariantJob: (req: { hash: string; relPath: string }) => {
    scheduler.scheduled.push({ hash: req.hash, relPath: req.relPath });
  },
}));

const { cleanupMediaVersions, deriveMediaProcessingStatus, syncMediaProcessingStatus } =
  await import("@src/utils/media/media-lifecycle.server");

const TENANT_ID = "tenant" as unknown as DatabaseId;

interface FakeRow {
  _id: string;
  tenantId: string;
  filename: string;
  mimeType: string;
  hash: string;
  path: string;
  size?: number;
  thumbnails?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  metadata: Record<string, unknown>;
}

function makeDb(rows: FakeRow[]): IDBAdapter {
  const byId = new Map(rows.map((row) => [row._id, row]));
  return {
    crud: {
      findMany: async (
        _collection: string,
        _query: unknown,
        options?: { limit?: number; offset?: number; tenantId?: string },
      ) => {
        const scoped = rows.filter(
          (row) => !options?.tenantId || row.tenantId === options.tenantId,
        );
        const offset = options?.offset ?? 0;
        const limit = options?.limit ?? scoped.length;
        return { success: true, data: scoped.slice(offset, offset + limit) };
      },
      findOne: async (_collection: string, query: { _id: string }) => ({
        success: true,
        data: byId.get(String(query._id)) ?? null,
      }),
      update: async (_collection: string, id: string, patch: Record<string, unknown>) => {
        const row = byId.get(String(id));
        if (row) Object.assign(row, patch);
        return { success: true, data: row };
      },
    },
  } as unknown as IDBAdapter;
}

function version(n: number, hash: string, filename = `v${n}.jpg`) {
  return {
    version: n,
    url: `/files/tenant/${hash}/original/${filename}`,
    path: `tenant/${hash}/original/${filename}`,
    hash,
    size: 10,
    filename,
    mimeType: "image/jpeg",
    createdAt: "2026-10-19T10:00:00.000Z",
    createdBy: "user-1",
  };
}

function imageRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    _id: "media-1",
    tenantId: "tenant",
    filename: "hero.jpg",
    mimeType: "image/jpeg",
    hash: "active-hash",
    path: "tenant/active-hash/original/hero.jpg",
    size: 100,
    thumbnails: { thumbnail: { url: "/files/t.jpg", width: 100, height: 100 } },
    createdAt: "2026-10-19T10:00:00.000Z",
    updatedAt: "2026-10-19T10:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

describe("cleanupMediaVersions", () => {
  beforeEach(() => {
    storage.removed.length = 0;
    storage.variantsDeleted.length = 0;
  });

  it("prunes beyond the retention window and releases only unreferenced hashes", async () => {
    const row = imageRow({
      metadata: {
        versions: [version(1, "hash-1"), version(2, "hash-2"), version(3, "active-hash")],
      },
    });
    // Another asset still serves hash-2, so its blobs must survive.
    const sibling = imageRow({
      _id: "media-2",
      hash: "hash-2",
      path: "tenant/hash-2/original/other.jpg",
      filename: "other.jpg",
      metadata: { versions: [] },
    });
    const db = makeDb([row, sibling]);

    const result = await cleanupMediaVersions(db, { tenantId: TENANT_ID, keepVersions: 1 });

    expect(result.versionsPruned).toBe(2);
    expect(result.hashesReleased).toEqual(["hash-1"]);
    expect(result.variantSetsDeleted).toBe(1);
    expect(storage.variantsDeleted).toEqual(["hash-1"]);
    expect(storage.removed).toContain("tenant/hash-1/original/v1.jpg");
    expect((row.metadata.versions as unknown[]).length).toBe(1);
  });

  it("never releases a hash that a retained version or the active original still uses", async () => {
    const row = imageRow({
      metadata: {
        // Both versions share bytes: pruning v1 must not release the hash that
        // retained v2 (and, transitively, the served renditions) still uses.
        versions: [version(1, "shared-hash"), version(2, "shared-hash")],
      },
    });
    const db = makeDb([row]);

    const result = await cleanupMediaVersions(db, { tenantId: TENANT_ID, keepVersions: 1 });

    expect(result.versionsPruned).toBe(1);
    expect(result.hashesReleased).toEqual([]);
    expect(storage.variantsDeleted).toEqual([]);
    expect(storage.removed).toEqual([]);
  });

  it("dry-run reports the plan without mutating records or storage", async () => {
    const row = imageRow({
      metadata: { versions: [version(1, "hash-1"), version(2, "active-hash")] },
    });
    const db = makeDb([row]);

    const result = await cleanupMediaVersions(db, {
      tenantId: TENANT_ID,
      keepVersions: 1,
      dryRun: true,
    });

    expect(result.versionsPruned).toBe(1);
    expect(result.hashesReleased).toEqual(["hash-1"]);
    expect((row.metadata.versions as unknown[]).length).toBe(2);
    expect(storage.variantsDeleted).toEqual([]);
  });
});

describe("deriveMediaProcessingStatus", () => {
  it("treats derivative-bearing images as ready", () => {
    expect(
      deriveMediaProcessingStatus(
        imageRow({ metadata: { imageVariants: [{ preset: "card", width: 320 }] } }),
      ),
    ).toBe("ready");
  });

  it("reports an image with no derivative evidence as processing", () => {
    expect(deriveMediaProcessingStatus(imageRow({ thumbnails: {}, metadata: {} }))).toBe(
      "processing",
    );
  });

  it("keeps a declared failure until it is retried", () => {
    expect(
      deriveMediaProcessingStatus(imageRow({ metadata: { processingStatus: "failed" } })),
    ).toBe("failed");
  });

  it("marks non-images ready (no derivative ladder)", () => {
    expect(
      deriveMediaProcessingStatus(
        imageRow({ mimeType: "application/pdf", filename: "doc.pdf", thumbnails: {} }),
      ),
    ).toBe("ready");
  });
});

describe("syncMediaProcessingStatus", () => {
  beforeEach(() => {
    scheduler.scheduled.length = 0;
  });

  it("persists the derived status for legacy rows", async () => {
    const row = imageRow({ thumbnails: {}, metadata: {} });
    const db = makeDb([row]);

    const result = await syncMediaProcessingStatus(db, { tenantId: TENANT_ID });

    expect(result.scanned).toBe(1);
    expect(result.processing).toBe(1);
    expect(result.updated).toBe(1);
    expect(row.metadata.processingStatus).toBe("processing");
  });

  it("re-queues missing derivatives when requested", async () => {
    const row = imageRow({ thumbnails: {}, metadata: { processingStatus: "failed" } });
    const db = makeDb([row]);

    const result = await syncMediaProcessingStatus(db, {
      tenantId: TENANT_ID,
      requeue: true,
    });

    expect(result.queued).toBe(1);
    expect(scheduler.scheduled).toEqual([
      { hash: "active-hash", relPath: "tenant/active-hash/original/hero.jpg" },
    ]);
    expect(row.metadata.processingStatus).toBe("processing");
  });

  it("does not schedule work for a ready image", async () => {
    const row = imageRow({
      metadata: { processingStatus: "ready", imageVariants: [{ preset: "card", width: 320 }] },
    });
    const db = makeDb([row]);

    const result = await syncMediaProcessingStatus(db, {
      tenantId: TENANT_ID,
      requeue: true,
    });

    expect(result.ready).toBe(1);
    expect(result.queued).toBe(0);
    expect(scheduler.scheduled).toEqual([]);
  });
});
