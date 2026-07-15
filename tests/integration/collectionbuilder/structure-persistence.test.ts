/**
 * @file tests/integration/collectionbuilder/structure-persistence.test.ts
 * @description Integration tests for Collection Builder organizational persistence.
 *
 * Verifies DB upsert + manifest roundtrip through contentSystem and collection-order utilities.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseAdapter } from "@src/databases/db-interface";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import { contentSystem, syncContentState } from "@src/content/index.server";
import {
  buildOrganizationalManifestFromNodes,
  getCollectionOrder,
  getStructureNodes,
  setOrganizationalManifest,
} from "@utils/collection-order.server";

const TENANT = "global";
const runId = Date.now().toString(36);
const categoryId = `int-cat-${runId}`;
const categoryPath = `/integration-category-${runId}`;
const categoryName = `Integration Category ${runId}`;

let db: DatabaseAdapter;

beforeAll(async () => {
  await ensureFullInitialization();
  const adapter = getDb();
  if (!adapter) throw new Error("Database not initialized");
  db = adapter;
  await contentSystem.initialize(TENANT);
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

describe("Collection Builder structure persistence (integration)", () => {
  it("upserts builder category nodes to the database via gui-save", async () => {
    await syncContentState({
      reason: "gui-save",
      tenantId: TENANT,
      adapter: db,
      operations: [
        {
          type: "create",
          node: {
            _id: categoryId,
            name: categoryName,
            path: categoryPath,
            nodeType: "category",
            source: "builder",
            order: 0,
            icon: "mdi:folder",
          },
        },
      ],
    });

    const structure = await contentSystem.getContentStructureFromDatabase("flat", TENANT, db);
    const saved = structure.find(
      (node) => node._id?.toString() === categoryId || node.path === categoryPath,
    );
    expect(saved).toBeDefined();
    expect(saved?.name).toBe(categoryName);
    expect(saved?.source).toBe("builder");
  });

  it("persists structureNodes and collectionOrder to manifest", async () => {
    const nodes = [
      {
        _id: categoryId,
        name: categoryName,
        nodeType: "category",
        path: categoryPath,
        order: 0,
        source: "builder",
      },
    ];
    const { order, structureNodes } = buildOrganizationalManifestFromNodes(nodes);

    await setOrganizationalManifest(order, structureNodes, TENANT);

    const manifestOrder = await getCollectionOrder(TENANT);
    const manifestStructure = await getStructureNodes(TENANT);

    expect(manifestStructure).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: categoryId,
          name: categoryName,
          source: "builder",
        }),
      ]),
    );
    expect(manifestOrder).toEqual(order);
  });

  it("exposes collectionOrder on layout data path via getCollectionOrder", async () => {
    const order = await getCollectionOrder(TENANT);
    expect(typeof order).toBe("object");
  });
});
