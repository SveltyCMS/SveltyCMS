/**
 * @file tests/unit/collectionbuilder/structure-persistence.test.ts
 * @description Regression tests for Collection Builder organizational persistence.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildOrganizationalManifestFromNodes,
  getCollectionOrder,
  getStructureNodes,
  setOrganizationalManifest,
} from "@utils/collection-order.server";

const tempRoots: string[] = [];

async function withTempManifest(fn: (manifestPath: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "svelty-structure-"));
  tempRoots.push(root);
  const compiledDir = path.join(root, ".compiledCollections");
  await fs.mkdir(compiledDir, { recursive: true });
  const manifestPath = path.join(compiledDir, ".compilation-manifest.json");
  const cwd = process.cwd();
  process.chdir(root);
  try {
    await fn(manifestPath);
  } finally {
    process.chdir(cwd);
  }
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("organizational manifest", () => {
  it("buildOrganizationalManifestFromNodes captures categories and collection order", () => {
    const { order, structureNodes } = buildOrganizationalManifestFromNodes([
      {
        _id: "cat-1",
        name: "Blog",
        nodeType: "category",
        path: "blog",
        order: 0,
        source: "builder",
      },
      {
        _id: "posts",
        name: "Posts",
        nodeType: "collection",
        path: "/collection/posts",
        parentId: "cat-1",
        order: 2,
      },
    ]);

    expect(order).toEqual({ posts: 2 });
    expect(structureNodes).toHaveLength(1);
    expect(structureNodes[0]?.name).toBe("Blog");
    expect(structureNodes[0]?.source).toBe("builder");
  });

  it("setOrganizationalManifest writes order and structureNodes to manifest", async () => {
    await withTempManifest(async (manifestPath) => {
      await setOrganizationalManifest(
        { posts: 1, authors: 0 },
        [
          {
            _id: "cat-blog",
            name: "Blog",
            nodeType: "category",
            path: "blog",
            order: 0,
            source: "builder",
          },
        ],
        undefined,
      );

      const raw = JSON.parse(await fs.readFile(manifestPath, "utf-8")) as Record<string, unknown>;
      expect(raw.collectionOrder).toEqual({ posts: 1, authors: 0 });
      expect(raw.structureNodes).toHaveLength(1);

      expect(await getCollectionOrder(undefined)).toEqual({ posts: 1, authors: 0 });
      expect(await getStructureNodes(undefined)).toHaveLength(1);
    });
  });
});

describe("setCollectionOrder merge behavior", () => {
  it("merges collectionOrder without removing compiled file entries", async () => {
    await withTempManifest(async (manifestPath) => {
      const compiledKey = path.join(".compiledCollections", "posts.js");
      await fs.writeFile(
        manifestPath,
        JSON.stringify(
          {
            [compiledKey]: {
              sourcePath: "posts.ts",
              sourceHash: "abc",
              compiledAt: 1,
            },
            collectionOrder: { posts: 0 },
          },
          null,
          2,
        ),
        "utf-8",
      );

      const { setCollectionOrder } = await import("@utils/collection-order.server");
      await setCollectionOrder({ posts: 3, pages: 1 }, undefined);

      const raw = JSON.parse(await fs.readFile(manifestPath, "utf-8")) as Record<string, unknown>;
      expect(raw.collectionOrder).toEqual({ posts: 3, pages: 1 });
      expect(raw[compiledKey]).toBeDefined();
    });
  });
});
