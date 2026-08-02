/**
 * @file tests/unit/content/collection-save-sync.test.ts
 * @description Filesystem-level proof for `collection-save` ContentSync:
 * write `.ts` → atomic compile → metrics / no-op / GUI lock cooldown.
 *
 * Isolated temp project root (chdir). Does not touch live `config/collections`.
 * Complements `sync-content-state.test.ts` with a multi-step save simulation.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tempRoots: string[] = [];

async function withTempProject(
  fn: (ctx: {
    userCollections: string;
    compiledCollections: string;
    sourcePath: string;
    sourceRel: string;
  }) => Promise<void>,
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "svelty-colsave-"));
  tempRoots.push(root);
  // Under the vitest harness getCollectionsPath(null) redirects to
  // config/test-collections — the temp project must mirror that layout or
  // compile()/drift detection find zero sources.
  const userCollections = path.join(root, "config", "test-collections");
  const compiledCollections = path.join(root, ".compiledCollections");
  await fs.mkdir(userCollections, { recursive: true });
  await fs.mkdir(compiledCollections, { recursive: true });

  const sourceRel = "intsave_posts.ts";
  const sourcePath = path.join(userCollections, sourceRel);
  await fs.writeFile(
    sourcePath,
    `export const schema = {
  name: "IntSavePosts",
  icon: "mdi:test-tube",
  fields: [{ label: "Title", widget: { Name: "Input" }, db_fieldName: "title", required: true }]
};`,
    "utf-8",
  );

  const cwd = process.cwd();
  process.chdir(root);
  try {
    await fn({ userCollections, compiledCollections, sourcePath, sourceRel });
  } finally {
    process.chdir(cwd);
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("collection-save ContentSync (filesystem)", () => {
  it("compiles .ts to .js with metrics and non-noOp on first save", async () => {
    await withTempProject(async ({ compiledCollections, sourcePath, sourceRel }) => {
      const engine = await import("@src/content/engine.server");
      vi.spyOn(engine, "refreshContent").mockResolvedValue(undefined);
      vi.spyOn(engine, "markFileDirty").mockImplementation(() => {});
      vi.spyOn(engine, "invalidateScanCache").mockImplementation(() => {});
      vi.spyOn(engine.contentService, "processChangedFiles").mockResolvedValue(undefined);
      vi.spyOn(engine.contentService, "handleIncrementalReload").mockResolvedValue(null);

      const { syncContentState } = await import("@src/content/sync-content-state.server");
      const result = await syncContentState({
        reason: "collection-save",
        targetFile: sourceRel,
        changedFile: sourcePath,
        fullBuild: false,
      });

      expect(result.reason).toBe("collection-save");
      expect(result.skippedByDedupe).toBe(false);
      expect(result.metrics.totalMs).toBeGreaterThanOrEqual(0);
      expect(result.compiled).toBeTruthy();
      expect(result.compiled!.processed).toBeGreaterThanOrEqual(1);
      expect(result.noOp).toBe(false);

      const js = await fs.readFile(path.join(compiledCollections, "intsave_posts.js"), "utf-8");
      expect(js).toMatch(/title|Title|Input/i);
    });
  });

  it("second save is hash no-op and watcher is not permanently locked", async () => {
    await withTempProject(async ({ sourcePath, sourceRel, compiledCollections }) => {
      const engine = await import("@src/content/engine.server");
      vi.spyOn(engine, "refreshContent").mockResolvedValue(undefined);
      vi.spyOn(engine, "markFileDirty").mockImplementation(() => {});
      vi.spyOn(engine, "invalidateScanCache").mockImplementation(() => {});
      vi.spyOn(engine.contentService, "processChangedFiles").mockResolvedValue(undefined);
      vi.spyOn(engine.contentService, "handleIncrementalReload").mockResolvedValue(null);

      const { syncContentState, shouldSkipWatcherSync } =
        await import("@src/content/sync-content-state.server");

      await syncContentState({
        reason: "collection-save",
        targetFile: sourceRel,
        changedFile: sourcePath,
      });

      const second = await syncContentState({
        reason: "collection-save",
        targetFile: sourceRel,
        fullBuild: false,
      });
      expect(second.compiled!.processed).toBe(0);
      expect(second.compiled!.skipped).toBeGreaterThanOrEqual(1);
      expect(second.noOp).toBe(true);

      await new Promise((r) => setTimeout(r, 500));
      expect(shouldSkipWatcherSync()).toBe(false);

      // Output still present after no-op
      await expect(
        fs.access(path.join(compiledCollections, "intsave_posts.js")),
      ).resolves.toBeUndefined();
    });
  });
});
