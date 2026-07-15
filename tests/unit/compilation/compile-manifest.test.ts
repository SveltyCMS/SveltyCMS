/**
 * @file tests/unit/compilation/compile-manifest.test.ts
 * @description Regression tests for compilation manifest path normalization and metadata preservation.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compile } from "@src/utils/compilation/compile";

const tempRoots: string[] = [];

async function createTempCompileFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "svelty-compile-"));
  tempRoots.push(root);

  const userCollections = path.join(root, "config", "collections");
  const compiledCollections = path.join(root, ".compiledCollections");
  await fs.mkdir(userCollections, { recursive: true });
  await fs.mkdir(compiledCollections, { recursive: true });

  await fs.writeFile(
    path.join(userCollections, "demo.ts"),
    `export const schema = {
  name: "demo",
  icon: "mdi:test",
  fields: [{ label: "Title", widget: { Name: "Input" }, db_fieldName: "title" }]
};`,
    "utf-8",
  );

  return { root, userCollections, compiledCollections };
}

async function cleanupTempRoots() {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
}

describe("compile() manifest integrity", () => {
  beforeEach(() => {
    tempRoots.length = 0;
  });

  afterEach(async () => {
    await cleanupTempRoots();
  });

  it("does not delete freshly compiled output when manifest keys use a different path shape", async () => {
    const { userCollections, compiledCollections } = await createTempCompileFixture();

    const absoluteJsPath = path.resolve(compiledCollections, "demo.js");
    const relativeJsKey = path.join(".compiledCollections", "demo.js");

    await fs.writeFile(
      path.join(compiledCollections, ".compilation-manifest.json"),
      JSON.stringify(
        {
          [relativeJsKey]: {
            sourcePath: "demo.ts",
            sourceHash: "stale-hash",
            compiledAt: 1,
          },
          collectionOrder: { demo: 2 },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const result = await compile({
      userCollections,
      compiledCollections,
      concurrency: 1,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.orphanedFiles).toHaveLength(0);

    const compiledExists = await fs
      .access(absoluteJsPath)
      .then(() => true)
      .catch(() => false);
    expect(compiledExists).toBe(true);

    const manifest = JSON.parse(
      await fs.readFile(path.join(compiledCollections, ".compilation-manifest.json"), "utf-8"),
    ) as Record<string, unknown>;

    expect(manifest.collectionOrder).toEqual({ demo: 2 });
    expect(manifest[absoluteJsPath]).toBeDefined();
    expect(manifest[relativeJsKey]).toBeUndefined();
  });

  it("recompiles when manifest hash matches but compiled output file is missing", async () => {
    const { userCollections, compiledCollections } = await createTempCompileFixture();

    await compile({ userCollections, compiledCollections, concurrency: 1 });

    const compiledPath = path.join(compiledCollections, "demo.js");
    await fs.unlink(compiledPath);

    const result = await compile({ userCollections, compiledCollections, concurrency: 1 });

    expect(result.processed).toBe(1);
    expect(result.orphanedFiles).toHaveLength(0);
    const recompiled = await fs
      .access(compiledPath)
      .then(() => true)
      .catch(() => false);
    expect(recompiled).toBe(true);
  });

  it("preserves collectionOrder across subsequent compiles", async () => {
    const { userCollections, compiledCollections } = await createTempCompileFixture();

    await compile({ userCollections, compiledCollections, concurrency: 1 });

    const manifestPath = path.join(compiledCollections, ".compilation-manifest.json");
    const first = JSON.parse(await fs.readFile(manifestPath, "utf-8")) as Record<string, unknown>;
    first.collectionOrder = { demo: 5 };
    await fs.writeFile(manifestPath, JSON.stringify(first, null, 2), "utf-8");

    await compile({ userCollections, compiledCollections, concurrency: 1 });

    const second = JSON.parse(await fs.readFile(manifestPath, "utf-8")) as Record<string, unknown>;
    expect(second.collectionOrder).toEqual({ demo: 5 });
  });

  it("preserves structureNodes across subsequent compiles", async () => {
    const { userCollections, compiledCollections } = await createTempCompileFixture();

    await compile({ userCollections, compiledCollections, concurrency: 1 });

    const manifestPath = path.join(compiledCollections, ".compilation-manifest.json");
    const guiCategories = [
      {
        _id: "cat-blog",
        name: "Blog",
        nodeType: "category",
        path: "/blog",
        order: 0,
        source: "builder",
      },
    ];
    const first = JSON.parse(await fs.readFile(manifestPath, "utf-8")) as Record<string, unknown>;
    first.structureNodes = guiCategories;
    await fs.writeFile(manifestPath, JSON.stringify(first, null, 2), "utf-8");

    await compile({ userCollections, compiledCollections, concurrency: 1 });

    const second = JSON.parse(await fs.readFile(manifestPath, "utf-8")) as Record<string, unknown>;
    expect(second.structureNodes).toEqual(guiCategories);
  });
});
