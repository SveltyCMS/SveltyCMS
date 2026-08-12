/**
 * @file tests/integration/databases/system-virtual-folder-contract.test.ts
 * @description Cross-adapter contract for system.virtualFolder.addToFolder.
 *
 * Regression guard for the relational (SQL) parity gap: addToFolder used to
 * return notImplemented on SQLite/MariaDB/PostgreSQL while MongoDB had a real
 * implementation. Verifies folder→media membership assignment (via getByFolder
 * and getByHash) and the missing-folder failure path on every engine.
 *
 * Run: bun test tests/integration/databases/system-virtual-folder-contract.test.ts
 * Matrix: DB=sqlite|postgresql|mariadb|mongodb bun test ...
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  DatabaseAdapter,
  DatabaseId,
  MediaItem,
  PaginatedResult,
} from "@src/databases/db-interface";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import { assertRealAdapter } from "@tests/helpers/assert-real-adapter";

const TENANT: DatabaseId = "global" as DatabaseId;

function runSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getData<T>(res: { success: boolean; data?: T }): T {
  return (res as { success: true; data: T }).data;
}

let db: DatabaseAdapter;
const cleanup: Array<() => Promise<void>> = [];

beforeAll(async () => {
  await ensureFullInitialization();
  db = getDb() as DatabaseAdapter;
  assertRealAdapter(db);
});

afterAll(async () => {
  for (const fn of [...cleanup].reverse()) {
    try {
      await fn();
    } catch {
      // best-effort cleanup — serial suites must stay isolated
    }
  }
});

describe("system.virtualFolder.addToFolder contract", () => {
  // The MongoDB virtualFolder methods take tenantId positionally (known
  // interface drift); relational engines take an options bag. Both resolve the
  // same rows because "global" disables tenant filtering on the SQL side.
  const vfOptions = () => (db.type === "mongodb" ? (TENANT as any) : { tenantId: TENANT });

  async function uploadFixtureItem(hash: string) {
    const uploaded = await db.media.files.upload(
      {
        filename: `${hash}.txt`,
        originalFilename: `${hash}.txt`,
        path: `/${hash}.txt`,
        mimeType: "text/plain",
        size: 42,
        hash,
        createdBy: "contract-test" as DatabaseId,
        updatedBy: "contract-test" as DatabaseId,
        metadata: {},
        thumbnails: {},
      },
      { tenantId: TENANT },
    );
    expect(uploaded.success).toBe(true);
    if (!uploaded.success) return null;
    const itemId = String((uploaded.data as MediaItem)._id);
    cleanup.push(async () => {
      await db.media.files.delete(itemId as DatabaseId, { tenantId: TENANT });
    });
    return itemId;
  }

  it("assigns a media item to the folder", async () => {
    const suffix = runSuffix();
    const folderPath = `/contract-vf-folder-${suffix}`;
    const fileHash = `contract-vf-hash-${suffix}`;

    const created = await db.system.virtualFolder.create(
      {
        path: folderPath,
        name: `Contract VF ${suffix}`,
        type: "folder",
        order: 0,
        parentId: null,
      },
      vfOptions(),
    );
    expect(created.success, `create failed: ${JSON.stringify(created).slice(0, 400)}`).toBe(true);
    if (!created.success) return;
    const folderId = String(created.data._id);
    cleanup.push(async () => {
      await db.system.virtualFolder.delete(folderId as DatabaseId, vfOptions());
    });

    const itemId = await uploadFixtureItem(fileHash);
    if (!itemId) return;

    const added = await db.system.virtualFolder.addToFolder(
      itemId as DatabaseId,
      folderPath,
      vfOptions(),
    );
    expect(added.success, `addToFolder failed: ${JSON.stringify(added).slice(0, 300)}`).toBe(true);

    // Verify membership via the media module (getByFolder).
    const inFolder = await db.media.files.getByFolder(folderId as DatabaseId, {
      tenantId: TENANT,
    });
    expect(inFolder.success).toBe(true);
    const inFolderItems = getData<PaginatedResult<MediaItem>>(inFolder);
    expect(Array.isArray(inFolderItems.items)).toBe(true);
    expect(inFolderItems.items.some((i) => String(i._id) === itemId)).toBe(true);

    // Regression: getByHash must resolve the same row on every engine. On
    // MongoDB the media module's own model (system_media) is the only path
    // that can see uploads — the crud "media" name normalizes to
    // collection_media and always missed.
    const byHash = await db.media.files.getByHash(fileHash, { tenantId: TENANT });
    expect(byHash.success).toBe(true);
    const byHashItem = getData<MediaItem | null>(byHash);
    expect(byHashItem).not.toBeNull();
    expect(String(byHashItem!._id)).toBe(itemId);
    expect(String(byHashItem!.folderId)).toBe(folderId);
  });

  it("fails when the target folder does not exist", async () => {
    const suffix = runSuffix();
    const fileHash = `contract-vf-missing-${suffix}`;

    const itemId = await uploadFixtureItem(fileHash);
    if (!itemId) return;

    const added = await db.system.virtualFolder.addToFolder(
      itemId as DatabaseId,
      `/contract-vf-does-not-exist-${suffix}`,
      vfOptions(),
    );
    expect(added.success).toBe(false);
  });
});
