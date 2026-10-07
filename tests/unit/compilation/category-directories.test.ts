/**
 * @file tests/unit/compilation/category-directories.test.ts
 * @description Category paths become directories and unsafe paths do not escape the root.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  categoryRelativeDir,
  ensureCategoryDirectories,
  mergeDiscoveredCategories,
  moveCategoryDirectories,
  planCategoryDirectoryMoves,
  removeEmptyCategoryDirectories,
} from "@src/utils/compilation/category-directories";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "svelty-category-dir-"));
  tempRoots.push(root);
  return root;
}

describe("category directories", () => {
  it("maps a builder category path onto a relative directory", () => {
    expect(categoryRelativeDir("/blog")).toBe("blog");
    expect(categoryRelativeDir("blog")).toBe("blog");
    expect(categoryRelativeDir("/blog/news")).toBe("blog/news");
    expect(categoryRelativeDir("/../../outside")).toBeNull();
    expect(categoryRelativeDir("/blog/../secret")).toBeNull();
    expect(categoryRelativeDir("C:/Windows")).toBeNull();
  });

  it("creates the category folder and leaves a folder that still has files", async () => {
    const root = await tempRoot();
    const source = path.join(root, "collections");
    const compiled = path.join(root, "compiled");
    await fs.mkdir(source);
    await fs.mkdir(compiled);

    await ensureCategoryDirectories([{ nodeType: "category", path: "/blog" }], [source, compiled]);

    expect((await fs.stat(path.join(source, "blog"))).isDirectory()).toBe(true);
    expect((await fs.stat(path.join(compiled, "blog"))).isDirectory()).toBe(true);

    await fs.writeFile(path.join(source, "blog", "posts.ts"), "export {};");
    await removeEmptyCategoryDirectories(
      [{ nodeType: "category", path: "/blog" }],
      [source, compiled],
    );

    expect((await fs.stat(path.join(source, "blog", "posts.ts"))).isFile()).toBe(true);
    await expect(fs.access(path.join(compiled, "blog"))).rejects.toThrow();
  });

  it("moves a category folder when its parent changes and leaves a reorder in place", async () => {
    const news = { _id: "news", nodeType: "category" as const, path: "/news" };
    const blog = {
      _id: "blog",
      nodeType: "category" as const,
      path: "/blog",
      parentId: "news",
    };
    expect(planCategoryDirectoryMoves([news, { ...blog, parentId: undefined }])).toEqual([]);
    expect(planCategoryDirectoryMoves([news, blog])).toEqual([
      { id: "blog", from: "blog", to: "news/blog", path: "/news/blog" },
    ]);

    const root = await tempRoot();
    const source = path.join(root, "collections");
    await fs.mkdir(path.join(source, "blog"), { recursive: true });
    await fs.writeFile(path.join(source, "blog", "notes.txt"), "keep");

    const moved = await moveCategoryDirectories(
      [{ id: "blog", from: "blog", to: "news/blog", path: "/news/blog" }],
      [source],
    );
    expect(moved.has("blog")).toBe(true);
    expect(await fs.readFile(path.join(source, "news", "blog", "notes.txt"), "utf-8")).toBe("keep");
    await expect(fs.access(path.join(source, "blog"))).rejects.toThrow();
  });

  it("records a folder that already exists on disk", () => {
    const merged = mergeDiscoveredCategories(
      [{ _id: "cat-news", name: "News", nodeType: "category", path: "/news", source: "builder" }],
      ["news", "news/recipes"],
    );
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({
      path: "/news/recipes",
      parentId: "cat-news",
      source: "filesystem",
    });
  });

  it("does not create a directory for a traversal path", async () => {
    const root = await tempRoot();
    await ensureCategoryDirectories([{ nodeType: "category", path: "/../../outside" }], [root]);
    expect(await fs.readdir(root)).toEqual([]);
  });
});
