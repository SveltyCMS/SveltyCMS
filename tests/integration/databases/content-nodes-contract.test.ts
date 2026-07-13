/**
 * @file tests/integration/databases/content-nodes-contract.test.ts
 * @description Cross-adapter contract for content_nodes bulkUpdate ↔ getStructure roundtrip.
 *
 * Catches regressions where:
 * - bulkUpdate reports success but rows are not readable (mock adapter / transaction rollback)
 * - path-based upserts violate PK constraints (_id vs path+tenant conflict targets)
 * - deleteMany does not remove structure nodes
 *
 * Run: bun test tests/integration/databases/content-nodes-contract.test.ts
 * Matrix: DB=postgresql,mariadb,mongodb bun test ...
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseAdapter, DatabaseId } from "@src/databases/db-interface";
import type { ContentNode } from "@src/content/types";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import { contentService } from "@src/content/engine.server";
import { syncContentState } from "@src/content/index.server";
import { assertRealAdapter } from "@tests/helpers/assert-real-adapter";

const TENANT: DatabaseId = "global" as DatabaseId;
const CATEGORY_NODE_TYPE = "category" as const;
const BUILDER_SOURCE = "builder" as const;

function runSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getData<T>(res: { success: boolean; data?: T }): T {
  return (res as { success: true; data: T }).data;
}

async function readPaths(db: DatabaseAdapter, paths: string[]) {
  const res = await db.content.nodes.getStructure("flat", { bypassTenantCheck: true });
  expect(res.success).toBe(true);
  const set = new Set(paths);
  const data = getData<ContentNode[]>(res);
  return (data ?? []).filter((n) => n.path && set.has(n.path));
}

async function deletePaths(db: DatabaseAdapter, paths: string[]) {
  if (paths.length === 0) return;
  await db.content.nodes.deleteMany(paths, { tenantId: TENANT });
}

let db: DatabaseAdapter;
const cleanupPaths: string[] = [];

beforeAll(async () => {
  await ensureFullInitialization();
  db = getDb() as DatabaseAdapter;
  assertRealAdapter(db);
});

afterAll(async () => {
  await deletePaths(db, [...new Set(cleanupPaths)]);
});

describe("content.nodes bulkUpdate contract", () => {
  it("reports success only when getStructure can read the inserted path", async () => {
    const suffix = runSuffix();
    const path = `/contract-insert-${suffix}`;
    const id = `contract-insert-${suffix}`;
    cleanupPaths.push(path);

    const bulk = await db.content.nodes.bulkUpdate(
      [
        {
          path,
          id,
          changes: {
            name: `Contract Insert ${suffix}`,
            path,
            nodeType: CATEGORY_NODE_TYPE,
            source: BUILDER_SOURCE,
            order: 1,
          },
        },
      ],
      { tenantId: TENANT },
    );

    expect(bulk.success).toBe(true);

    const found = await readPaths(db, [path]);
    expect(found).toHaveLength(1);
    expect(found[0]?.path).toBe(path);
    expect(found[0]?.name).toBe(`Contract Insert ${suffix}`);
    expect(found[0]?.source).toBe(BUILDER_SOURCE);
  });

  it("upserts the same path idempotently with the same _id", async () => {
    const suffix = runSuffix();
    const path = `/contract-idempotent-${suffix}`;
    const id = `contract-idem-${suffix}`;
    cleanupPaths.push(path);

    const payload = {
      path,
      id,
      changes: {
        name: `First ${suffix}`,
        path,
        nodeType: CATEGORY_NODE_TYPE,
        source: BUILDER_SOURCE,
        order: 0,
      },
    };

    expect((await db.content.nodes.bulkUpdate([payload], { tenantId: TENANT })).success).toBe(true);
    expect(
      (
        await db.content.nodes.bulkUpdate(
          [
            {
              ...payload,
              changes: { ...payload.changes, name: `Second ${suffix}` },
            },
          ],
          { tenantId: TENANT },
        )
      ).success,
    ).toBe(true);

    const found = await readPaths(db, [path]);
    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe(`Second ${suffix}`);
    expect(found[0]?._id?.toString()).toBe(id);
  });

  it("upserts by path when bulkUpdate receives a different id for an existing path", async () => {
    const suffix = runSuffix();
    const path = `/contract-path-key-${suffix}`;
    const originalId = `contract-path-a-${suffix}`;
    const alternateId = `contract-path-b-${suffix}`;
    cleanupPaths.push(path);

    expect(
      (
        await db.content.nodes.bulkUpdate(
          [
            {
              path,
              id: originalId,
              changes: {
                name: `Original ${suffix}`,
                path,
                nodeType: CATEGORY_NODE_TYPE,
                source: BUILDER_SOURCE,
              },
            },
          ],
          { tenantId: TENANT },
        )
      ).success,
    ).toBe(true);

    const second = await db.content.nodes.bulkUpdate(
      [
        {
          path,
          id: alternateId,
          changes: {
            name: `Path-keyed update ${suffix}`,
            path,
            nodeType: CATEGORY_NODE_TYPE,
            source: BUILDER_SOURCE,
          },
        },
      ],
      { tenantId: TENANT },
    );

    expect(second.success).toBe(true);

    const found = await readPaths(db, [path]);
    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe(`Path-keyed update ${suffix}`);
    // Path+tenant conflict must win — primary key must not block the upsert.
    expect(found[0]?._id?.toString()).toBe(originalId);
  });

  it("deleteMany removes structure nodes by path", async () => {
    const suffix = runSuffix();
    const path = `/contract-delete-${suffix}`;
    const id = `contract-delete-${suffix}`;

    expect(
      (
        await db.content.nodes.bulkUpdate(
          [
            {
              path,
              id,
              changes: {
                name: "Delete me",
                path,
                nodeType: CATEGORY_NODE_TYPE,
                source: BUILDER_SOURCE,
              },
            },
          ],
          { tenantId: TENANT },
        )
      ).success,
    ).toBe(true);

    const del = await db.content.nodes.deleteMany([path], { tenantId: TENANT });
    expect(del.success).toBe(true);

    const found = await readPaths(db, [path]);
    expect(found).toHaveLength(0);
  });
});

describe("contentService + syncContentState adapter threading", () => {
  it("gui-save persists via explicit adapter and reads back on the same adapter", async () => {
    const suffix = runSuffix();
    const path = `/contract-gui-${suffix}`;
    const id = `contract-gui-${suffix}`;
    cleanupPaths.push(path);

    await syncContentState({
      reason: "gui-save",
      tenantId: TENANT,
      adapter: db,
      operations: [
        {
          type: "create",
          node: {
            _id: id,
            name: `GUI ${suffix}`,
            path,
            nodeType: CATEGORY_NODE_TYPE,
            source: BUILDER_SOURCE,
            order: 2,
          },
        },
      ],
    });

    const fromService = await contentService.getContentStructureFromDatabase("flat", TENANT, db);
    const saved = fromService.find((n) => n.path === path || n._id?.toString() === id);
    expect(saved).toBeDefined();
    expect(saved?.name).toBe(`GUI ${suffix}`);
    expect(saved?.source).toBe(BUILDER_SOURCE);
  });

  it("getContentStructureFromDatabase without adapter uses live db (not empty mock)", async () => {
    const suffix = runSuffix();
    const path = `/contract-live-db-${suffix}`;
    const id = `contract-live-${suffix}`;
    cleanupPaths.push(path);

    await db.content.nodes.bulkUpdate(
      [
        {
          path,
          id,
          changes: {
            name: `Live DB ${suffix}`,
            path,
            nodeType: CATEGORY_NODE_TYPE,
            source: BUILDER_SOURCE,
          },
        },
      ],
      { tenantId: TENANT },
    );

    const structure = await contentService.getContentStructureFromDatabase("flat", TENANT);
    expect(structure.some((n) => n.path === path)).toBe(true);
  });
});
