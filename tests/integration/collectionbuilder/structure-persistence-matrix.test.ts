/**
 * @file tests/integration/collectionbuilder/structure-persistence-matrix.test.ts
 * @description Cross-adapter structure persistence via unified syncContentState gui-save path.
 *
 * Run against any adapter:
 *   DB=sqlite bun test tests/integration/collectionbuilder/structure-persistence-matrix.test.ts
 *   DB=postgresql,mariadb,mongodb bun test ...
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseAdapter } from "@src/databases/db-interface";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import { syncContentState } from "@src/content/index.server";
import { getCollectionOrder, getStructureNodes } from "@utils/collection-order.server";

const TENANT = "global";
const runId = Date.now().toString(36);
const categoryId = `matrix-cat-${runId}`;
const categoryPath = `/matrix-category-${runId}`;

let db: DatabaseAdapter;

beforeAll(async () => {
  await ensureFullInitialization();
  const adapter = getDb();
  if (!adapter) throw new Error("Database not initialized");
  db = adapter;
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
    /* best-effort cleanup */
  }
});

describe("Structure persistence matrix (adapter-agnostic)", () => {
  it("gui-save persists category to DB and manifest", async () => {
    const result = await syncContentState({
      reason: "gui-save",
      tenantId: TENANT,
      adapter: db,
      operations: [
        {
          type: "create",
          node: {
            _id: categoryId,
            name: `Matrix Category ${runId}`,
            path: categoryPath,
            nodeType: "category",
            source: "builder",
            order: 0,
            icon: "mdi:folder",
          },
        },
      ],
    });

    expect(
      result.contentStructure?.some(
        (n) => n._id?.toString() === categoryId || n.path === categoryPath,
      ),
    ).toBe(true);

    const order = await getCollectionOrder(TENANT);
    const structure = await getStructureNodes(TENANT);
    expect(structure.some((n) => n._id === categoryId)).toBe(true);
    expect(typeof order).toBe("object");
  });

  it("boot reconciles manifest when organizational drift exists", async () => {
    const bootResult = await syncContentState({ reason: "boot", tenantId: TENANT, adapter: db });
    expect(bootResult.orgDrift).toBeDefined();
    expect(bootResult.orgDrift?.reconciled === true || bootResult.orgDrift?.drifted === false).toBe(
      true,
    );
  });
});
