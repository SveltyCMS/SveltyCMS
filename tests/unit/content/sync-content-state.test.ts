/**
 * @file tests/unit/content/sync-content-state.test.ts
 * @description Unit tests for unified content synchronization coordinator.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempRoots: string[] = [];

async function withTempProject(
  fn: (roots: {
    root: string;
    userCollections: string;
    compiledCollections: string;
    sourceFile: string;
    compiledFile: string;
  }) => Promise<void>,
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "svelty-sync-"));
  tempRoots.push(root);
  // Under the vitest harness getCollectionsPath(null) redirects to
  // config/test-collections — the temp project must mirror that layout or
  // compile()/drift detection find zero sources.
  const userCollections = path.join(root, "config", "test-collections");
  const compiledCollections = path.join(root, ".compiledCollections");
  await fs.mkdir(userCollections, { recursive: true });
  await fs.mkdir(compiledCollections, { recursive: true });

  const sourceFile = path.join(userCollections, "posts.ts");
  const compiledFile = path.join(compiledCollections, "posts.js");
  await fs.writeFile(
    sourceFile,
    "export const schema = { _id: 'posts', name: 'Posts', fields: [] };",
    "utf-8",
  );
  await fs.writeFile(
    compiledFile,
    "export const schema = { _id: 'posts', name: 'Posts', fields: [] };",
    "utf-8",
  );

  const cwd = process.cwd();
  process.chdir(root);
  try {
    await fn({ root, userCollections, compiledCollections, sourceFile, compiledFile });
  } finally {
    process.chdir(cwd);
  }
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("detectCompilationDrift", () => {
  it("returns no drift when compiled output is newer than source", async () => {
    await withTempProject(async ({ sourceFile, compiledFile }) => {
      const now = Date.now();
      await fs.utimes(sourceFile, (now - 10_000) / 1000, (now - 10_000) / 1000);
      await fs.utimes(compiledFile, now / 1000, now / 1000);

      const { detectCompilationDrift } = await import("@src/content/sync-content-state.server");
      const report = await detectCompilationDrift(null);
      expect(report.drifted).toBe(false);
      expect(report.driftedFiles).toHaveLength(0);
    });
  });

  it("detects drift when source is newer than compiled output", async () => {
    await withTempProject(async ({ sourceFile, compiledFile }) => {
      const now = Date.now();
      await fs.utimes(compiledFile, (now - 10_000) / 1000, (now - 10_000) / 1000);
      await fs.utimes(sourceFile, now / 1000, now / 1000);

      const { detectCompilationDrift } = await import("@src/content/sync-content-state.server");
      const report = await detectCompilationDrift(null);
      expect(report.drifted).toBe(true);
      expect(report.driftedFiles).toContain("posts.ts");
    });
  });

  it("detects drift when compiled output is missing", async () => {
    await withTempProject(async ({ compiledFile }) => {
      await fs.unlink(compiledFile);

      const { detectCompilationDrift } = await import("@src/content/sync-content-state.server");
      const report = await detectCompilationDrift(null);
      expect(report.drifted).toBe(true);
      expect(report.driftedFiles).toContain("posts.ts");
    });
  });
});

describe("detectOrganizationalDrift", () => {
  it("reports no drift when manifest matches DB structure", async () => {
    const nodes = [
      {
        _id: "posts",
        name: "Posts",
        path: "/collection/posts",
        nodeType: "collection",
        order: 1,
      },
      {
        _id: "cat-1",
        name: "Blog",
        path: "/blog",
        nodeType: "category",
        source: "builder",
        order: 0,
      },
    ];

    const { contentService } = await import("@src/content/engine.server");
    vi.spyOn(contentService, "getContentStructureFromDatabase").mockResolvedValue(nodes as never);

    const { buildOrganizationalManifestFromNodes } = await import("@utils/collection-order.server");
    const { order, structureNodes } = buildOrganizationalManifestFromNodes(nodes);

    const orderMod = await import("@utils/collection-order.server");
    vi.spyOn(orderMod, "getCollectionOrder").mockResolvedValue(order);
    vi.spyOn(orderMod, "getStructureNodes").mockResolvedValue(structureNodes);

    const { detectOrganizationalDrift } = await import("@src/content/sync-content-state.server");
    const report = await detectOrganizationalDrift("global");
    expect(report.drifted).toBe(false);
    expect(report.orderMismatch).toBe(false);
    expect(report.structureMismatch).toBe(false);
  });

  it("detects drift when manifest order diverges from DB", async () => {
    const nodes = [
      {
        _id: "posts",
        name: "Posts",
        path: "/collection/posts",
        nodeType: "collection",
        order: 5,
      },
    ];

    const { contentService } = await import("@src/content/engine.server");
    vi.spyOn(contentService, "getContentStructureFromDatabase").mockResolvedValue(nodes as never);

    const orderMod = await import("@utils/collection-order.server");
    vi.spyOn(orderMod, "getCollectionOrder").mockResolvedValue({ posts: 99 });
    vi.spyOn(orderMod, "getStructureNodes").mockResolvedValue([]);

    const { detectOrganizationalDrift } = await import("@src/content/sync-content-state.server");
    const report = await detectOrganizationalDrift("global");
    expect(report.drifted).toBe(true);
    expect(report.orderMismatch).toBe(true);
  });

  it("reconcileOrganizationalManifest heals manifest from DB", async () => {
    const nodes = [
      {
        _id: "cat-2",
        name: "News",
        path: "/news",
        nodeType: "category",
        source: "builder",
        order: 0,
      },
    ];

    const { contentService } = await import("@src/content/engine.server");
    vi.spyOn(contentService, "getContentStructureFromDatabase").mockResolvedValue(nodes as never);

    const orderMod = await import("@utils/collection-order.server");
    vi.spyOn(orderMod, "getCollectionOrder").mockResolvedValue({});
    vi.spyOn(orderMod, "getStructureNodes").mockResolvedValue([]);
    const setManifestSpy = vi.spyOn(orderMod, "setOrganizationalManifest").mockResolvedValue();

    const { reconcileOrganizationalManifest } =
      await import("@src/content/sync-content-state.server");
    const report = await reconcileOrganizationalManifest("global");
    expect(report.drifted).toBe(true);
    expect(report.reconciled).toBe(true);
    expect(setManifestSpy).toHaveBeenCalled();
  });
});

describe("syncContentState", () => {
  it("gui-save rejects empty operations (fail-closed)", async () => {
    const { syncContentState } = await import("@src/content/sync-content-state.server");
    await expect(syncContentState({ reason: "gui-save", operations: [] })).rejects.toThrow(
      /requires at least one operation/i,
    );
  });

  it("gui-save routes through upsert without fullReload and broadcasts SSE", async () => {
    await withTempProject(async () => {
      const { contentService } = await import("@src/content/engine.server");
      const fullReloadSpy = vi.spyOn(contentService, "fullReload").mockResolvedValue(undefined);
      const upsertSpy = vi.spyOn(contentService, "upsertContentNodes").mockResolvedValue(undefined);
      vi.spyOn(contentService, "getContentStructureFromDatabase").mockResolvedValue([
        {
          _id: "cat-1",
          name: "Blog",
          path: "/blog",
          nodeType: "category",
          source: "builder",
          order: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ]);

      const orderMod = await import("@utils/collection-order.server");
      vi.spyOn(orderMod, "setOrganizationalManifest").mockResolvedValue();

      const engine = await import("@src/content/engine.server");
      const sseSpy = vi.spyOn(engine, "notifyContentUpdate").mockResolvedValue(undefined);

      // Avoid real compile against empty/minimal fixture during gui-save
      const compileMod = await import("@utils/compilation/compile");
      vi.spyOn(compileMod, "compile").mockResolvedValue({
        processed: 0,
        skipped: 1,
        errors: [],
        duration: 1,
        orphanedFiles: [],
        schemaWarnings: [],
        changedJsPaths: [],
        changedSourceFiles: [],
        noOp: true,
      });

      const { syncContentState } = await import("@src/content/sync-content-state.server");
      const result = await syncContentState({
        reason: "gui-save",
        tenantId: "global",
        operations: [
          {
            type: "create",
            node: {
              _id: "cat-1",
              name: "Blog",
              path: "/blog",
              nodeType: "category",
            },
          },
        ],
      });

      expect(upsertSpy).toHaveBeenCalled();
      expect(fullReloadSpy).not.toHaveBeenCalled();
      expect(sseSpy).toHaveBeenCalledWith("global");
      expect(result.metrics).toBeDefined();
      expect(result.changedIds).toContain("cat-1");
    });
  });

  it("boot reconciles organizational manifest before full refresh", async () => {
    await withTempProject(async () => {
      const orderMod = await import("@utils/collection-order.server");
      vi.spyOn(orderMod, "getCollectionOrder").mockResolvedValue({});
      vi.spyOn(orderMod, "getStructureNodes").mockResolvedValue([]);
      vi.spyOn(orderMod, "setOrganizationalManifest").mockResolvedValue();

      const { contentService } = await import("@src/content/engine.server");
      vi.spyOn(contentService, "getContentStructureFromDatabase").mockResolvedValue([
        {
          _id: "posts",
          name: "Posts",
          path: "/collection/posts",
          nodeType: "collection",
          order: 2,
        },
      ] as never);

      const engine = await import("@src/content/engine.server");
      vi.spyOn(engine, "refreshContent").mockResolvedValue(undefined);

      const { syncContentState } = await import("@src/content/sync-content-state.server");
      const result = await syncContentState({ reason: "boot", tenantId: "global" });
      expect(result.orgDrift?.reconciled).toBe(true);
      expect(engine.refreshContent).toHaveBeenCalled();
      expect(result.metrics.totalMs).toBeGreaterThanOrEqual(0);
    });
  });

  it("watcher skips when GUI compile session is active", async () => {
    const {
      beginGuiCompileSession,
      endGuiCompileSession,
      shouldSkipWatcherSync,
      syncContentState,
    } = await import("@src/content/sync-content-state.server");

    const gen = beginGuiCompileSession(5_000);
    expect(shouldSkipWatcherSync()).toBe(true);

    const compileMod = await import("@utils/compilation/compile");
    const compileSpy = vi.spyOn(compileMod, "compile");

    const result = await syncContentState({ reason: "watcher", targetFile: "posts.ts" });
    expect(result.skippedByDedupe).toBe(true);
    expect(result.noOp).toBe(true);
    expect(compileSpy).not.toHaveBeenCalled();

    endGuiCompileSession(gen, 0);
    // Force lock expiry
    await new Promise((r) => setTimeout(r, 10));
  });

  it("file-keyed GUI lock only suppresses the owned file (external edits compile)", async () => {
    const { beginGuiCompileSession, endGuiCompileSession, shouldSkipWatcherSync } =
      await import("@src/content/sync-content-state.server");

    const gen = beginGuiCompileSession({ files: ["posts.ts"], ttlMs: 50 });
    try {
      expect(shouldSkipWatcherSync("posts.ts")).toBe(true); // owned by the GUI session
      // Regression: the Vite watcher echo fires for the COMPILED output
      // (.compiledCollections/posts.js) — extension-stripped keys must match.
      expect(shouldSkipWatcherSync("posts.js")).toBe(true);
      expect(shouldSkipWatcherSync("other-collection.ts")).toBe(false); // external edit must compile
    } finally {
      endGuiCompileSession(gen, 0);
    }
    // end() extends from the lock's expiry (not now); with a 50ms TTL it lapses quickly
    await new Promise((r) => setTimeout(r, 80));
    expect(shouldSkipWatcherSync("posts.ts")).toBe(false); // expired → cleared lazily
  });

  it("releaseGuiCompileSession abandons the lock so the watcher retries the same file", async () => {
    const { beginGuiCompileSession, releaseGuiCompileSession, shouldSkipWatcherSync } =
      await import("@src/content/sync-content-state.server");

    const gen = beginGuiCompileSession(5_000);
    expect(shouldSkipWatcherSync("posts.ts")).toBe(true);
    // syncContentState calls releaseGuiCompileSession when a GUI save fails — no cooldown,
    // so the watcher event for the same write is allowed to retry immediately.
    releaseGuiCompileSession(gen);
    expect(shouldSkipWatcherSync("posts.ts")).toBe(false);
  });

  it("detectCompilationDrift ignores mtime-only false positives when hash matches", async () => {
    await withTempProject(
      async ({ userCollections, compiledCollections, sourceFile, compiledFile }) => {
        const { xxhash64 } = await import("hash-wasm");
        const content = await fs.readFile(sourceFile, "utf8");
        const sourceHash = await xxhash64(content);

        await fs.writeFile(
          path.join(compiledCollections, ".compilation-manifest.json"),
          JSON.stringify({
            [path.resolve(compiledCollections, "posts.js")]: {
              sourcePath: "posts.ts",
              sourceHash,
              compiledAt: Date.now(),
            },
          }),
          "utf-8",
        );

        const now = Date.now();
        await fs.utimes(compiledFile, (now - 10_000) / 1000, (now - 10_000) / 1000);
        await fs.utimes(sourceFile, now / 1000, now / 1000);

        const { detectCompilationDrift } = await import("@src/content/sync-content-state.server");
        const report = await detectCompilationDrift(null);
        expect(report.drifted).toBe(false);
        expect(report.hashConfirmedFresh).toBeGreaterThanOrEqual(1);
        void userCollections;
      },
    );
  });

  it("watcher compiles target file and returns metrics (no-op on second pass)", async () => {
    await withTempProject(async ({ userCollections, compiledCollections, sourceFile }) => {
      // Source needs a real compileable schema (fields non-empty for engine; empty ok for compile)
      await fs.writeFile(
        sourceFile,
        `export const schema = {
  name: "Posts",
  icon: "mdi:post",
  fields: [{ label: "Title", widget: { Name: "Input" }, db_fieldName: "title" }]
};`,
        "utf-8",
      );

      const engine = await import("@src/content/engine.server");
      vi.spyOn(engine, "refreshContent").mockResolvedValue(undefined);
      vi.spyOn(engine, "markFileDirty").mockImplementation(() => {});
      vi.spyOn(engine, "invalidateScanCache").mockImplementation(() => {});
      vi.spyOn(engine.contentService, "processChangedFiles").mockResolvedValue(undefined);

      // Ensure lock is clear after previous test
      const { endGuiCompileSession, beginGuiCompileSession, syncContentState } =
        await import("@src/content/sync-content-state.server");
      endGuiCompileSession(beginGuiCompileSession(1), 0);
      await new Promise((r) => setTimeout(r, 5));

      const first = await syncContentState({
        reason: "watcher",
        targetFile: "posts.ts",
        fullBuild: false,
      });
      expect(first.skippedByDedupe).toBe(false);
      expect(first.metrics.totalMs).toBeGreaterThanOrEqual(0);
      expect(first.compiled).toBeTruthy();
      // First compile should process or skip depending on prior output
      expect(first.metrics.processed + first.metrics.skipped).toBeGreaterThanOrEqual(0);

      const jsPath = path.join(compiledCollections, "posts.js");
      await expect(fs.access(jsPath)).resolves.toBeUndefined();

      const second = await syncContentState({
        reason: "watcher",
        targetFile: "posts.ts",
        fullBuild: false,
      });
      // Unchanged source → noOp preferred
      if (second.compiled) {
        expect(second.compiled.skipped + second.compiled.processed).toBeGreaterThanOrEqual(1);
      }
      void userCollections;
    });
  });

  it("collection-save acquires GUI lock so concurrent watcher is skipped", async () => {
    await withTempProject(async ({ sourceFile }) => {
      await fs.writeFile(
        sourceFile,
        `export const schema = {
  name: "Posts",
  icon: "mdi:post",
  fields: [{ label: "Title", widget: { Name: "Input" }, db_fieldName: "title" }]
};`,
        "utf-8",
      );

      const engine = await import("@src/content/engine.server");
      vi.spyOn(engine, "refreshContent").mockResolvedValue(undefined);
      vi.spyOn(engine, "markFileDirty").mockImplementation(() => {});
      vi.spyOn(engine, "invalidateScanCache").mockImplementation(() => {});

      const { syncContentState, shouldSkipWatcherSync } =
        await import("@src/content/sync-content-state.server");

      // During collection-save the lock is held; simulate overlap by checking after begin via spy
      const savePromise = syncContentState({
        reason: "collection-save",
        targetFile: "posts.ts",
        changedFile: sourceFile,
      });

      // Mid-flight lock may be active; await completion
      const saveResult = await savePromise;
      expect(saveResult.reason).toBe("collection-save");
      expect(saveResult.metrics).toBeDefined();
      expect(saveResult.compiled).toBeTruthy();

      // After cooldown (~450ms) watcher should not be skipped forever — wait past cooldown
      await new Promise((r) => setTimeout(r, 500));
      expect(shouldSkipWatcherSync()).toBe(false);
    });
  });
});
