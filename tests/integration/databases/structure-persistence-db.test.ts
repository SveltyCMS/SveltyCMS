/**
 * @file tests/integration/databases/structure-persistence-db.test.ts
 * @description Adapter-agnostic DB roundtrip for GUI structure saves (real adapter, no HTTP).
 *
 * Run: bun test tests/integration/databases/structure-persistence-db.test.ts
 * Requires a running database (SQLite, MongoDB, PostgreSQL, or MariaDB).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { DatabaseAdapter, DatabaseId } from "@src/databases/db-interface";
import type { ContentNode } from "@src/content/types";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import { syncContentState } from "@src/content/index.server";
import { assertRealAdapter } from "@tests/helpers/assert-real-adapter";
import { withSystemScope } from "@src/databases/system-tenant-scope";

const TENANT: DatabaseId = "global" as DatabaseId;
const CATEGORY_NODE_TYPE = "category" as const;
const BUILDER_SOURCE = "builder" as const;
const runId = Date.now().toString(36);
const categoryPath = `/unit-structure-${runId}`;
const cleanupPaths: string[] = [];

function getData<T>(res: { success: boolean; data?: T }): T {
  return (res as { success: true; data: T }).data;
}

let db: DatabaseAdapter;

beforeAll(async () => {
  await ensureFullInitialization();
  const adapter = getDb();
  if (!adapter) throw new Error("Database not initialized");
  db = adapter;
  assertRealAdapter(db);
});

afterAll(async () => {
  try {
    await syncContentState({
      reason: "gui-save",
      tenantId: TENANT,
      adapter: db,
      operations: [{ type: "delete", node: { path: categoryPath } }],
    });
  } catch {
    /* cleanup */
  }
  try {
    const paths = [...new Set(cleanupPaths)];
    if (paths.length > 0) {
      await db.content.nodes.deleteMany(paths, { tenantId: TENANT });
    }
  } catch {
    /* cleanup */
  }
});

describe("structure persistence DB roundtrip", () => {
  it("persists builder category via bulkUpdate on active adapter", async () => {
    const bulk = await db.content.nodes.bulkUpdate(
      [
        {
          path: categoryPath,
          id: `unit-cat-${runId}`,
          changes: {
            name: `Unit Category ${runId}`,
            path: categoryPath,
            nodeType: CATEGORY_NODE_TYPE,
            source: BUILDER_SOURCE,
            order: 0,
          },
        },
      ],
      { tenantId: TENANT },
    );

    expect(bulk.success).toBe(true);

    const probe = await db.content.nodes.getStructure("flat", withSystemScope("testing"));

    expect(probe.success).toBe(true);
    const nodes = getData<ContentNode[]>(probe);
    expect(nodes.some((n: ContentNode) => n.path === categoryPath)).toBe(true);
  });

  it("round-trips order, parentId and the merged data.order through reorderStructure", async () => {
    const suffix = `${runId}-reorder`;
    const rootPath = `/unit-reorder-root-${suffix}`;
    const alphaPath = `/unit-reorder-alpha-${suffix}`;
    const betaPath = `/unit-reorder-beta-${suffix}`;
    const rootId = `unit-reorder-root-${suffix}`;
    const alphaId = `unit-reorder-alpha-${suffix}`;
    const betaId = `unit-reorder-beta-${suffix}`;
    cleanupPaths.push(rootPath, alphaPath, betaPath);

    const seeded = await db.content.nodes.bulkUpdate(
      [
        {
          path: rootPath,
          id: rootId,
          changes: {
            name: `Root ${suffix}`,
            path: rootPath,
            nodeType: CATEGORY_NODE_TYPE,
            source: BUILDER_SOURCE,
            order: 0,
          },
        },
        {
          path: alphaPath,
          id: alphaId,
          changes: {
            name: `Alpha ${suffix}`,
            path: alphaPath,
            nodeType: CATEGORY_NODE_TYPE,
            source: BUILDER_SOURCE,
            order: 1,
          },
        },
        {
          path: betaPath,
          id: betaId,
          changes: {
            name: `Beta ${suffix}`,
            path: betaPath,
            nodeType: CATEGORY_NODE_TYPE,
            source: BUILDER_SOURCE,
            order: 2,
          },
        },
      ],
      { tenantId: TENANT },
    );
    expect(seeded.success).toBe(true);

    // GUI drag-reorder payload: every affected node, reparented under root.
    const reordered = await db.content.nodes.reorderStructure([
      { id: alphaId, parentId: rootId, order: 7, path: alphaPath },
      { id: betaId, parentId: rootId, order: 3, path: betaPath },
    ]);
    expect(reordered.success).toBe(true);

    const probe = await db.content.nodes.getStructure(
      "flat",
      withSystemScope("testing", { bypassCache: true }),
    );
    expect(probe.success).toBe(true);
    const nodes = getData<ContentNode[]>(probe);
    const alpha = nodes.find((n: ContentNode) => n.path === alphaPath);
    const beta = nodes.find((n: ContentNode) => n.path === betaPath);

    expect(alpha).toBeDefined();
    expect(beta).toBeDefined();
    // SQL keeps `order` twice (position column + merged data blob); Mongo stores it
    // as a first-class field. Either way the read-back must serve the NEW order.
    expect(alpha?.order).toBe(7);
    expect(beta?.order).toBe(3);
    expect(alpha?.parentId?.toString()).toBe(rootId);
    expect(beta?.parentId?.toString()).toBe(rootId);
  });
});
