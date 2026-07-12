/**
 * @file tests/unit/content/structure-persistence-db.test.ts
 * @description Adapter-agnostic DB roundtrip for GUI structure saves (real adapter, no HTTP).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseAdapter, DatabaseId } from "@src/databases/db-interface";
import type { ContentNode } from "@src/content/types";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import { syncContentState } from "@src/content/index.server";
import { assertRealAdapter } from "@tests/helpers/assert-real-adapter";

// Skip under Vitest with mocks — requires real DB adapter (bun test or integration)
const skipUnderVitestMocks = typeof Bun === "undefined" && process.env.BUN_TEST_MOCKS !== "false";

const TENANT: DatabaseId = "global" as DatabaseId;
const CATEGORY_NODE_TYPE = "category" as const;
const BUILDER_SOURCE = "builder" as const;
const runId = Date.now().toString(36);
const categoryPath = `/unit-structure-${runId}`;

function getData<T>(res: { success: boolean; data?: T }): T {
  return (res as { success: true; data: T }).data;
}

let db: DatabaseAdapter;

const describeDb = skipUnderVitestMocks ? describe.skip : describe;

beforeAll(async () => {
  if (skipUnderVitestMocks) return;
  await ensureFullInitialization();
  const adapter = getDb();
  if (!adapter) throw new Error("Database not initialized");
  db = adapter;
  assertRealAdapter(db);
});

afterAll(async () => {
  if (skipUnderVitestMocks) return;
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
});

describeDb("structure persistence DB roundtrip", () => {
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

    const probe = await db.content.nodes.getStructure("flat", {
      bypassTenantCheck: true,
    });

    expect(probe.success).toBe(true);
    const nodes = getData<ContentNode[]>(probe);
    expect(nodes.some((n: ContentNode) => n.path === categoryPath)).toBe(true);
  });
});
