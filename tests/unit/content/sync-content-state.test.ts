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
  const userCollections = path.join(root, "config", "collections");
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

      const { syncContentState } = await import("@src/content/sync-content-state.server");
      await syncContentState({
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
    });
  });
});
