/**
 * @file tests/unit/content/sync-content-security.test.ts
 * @description Security and reliability checks for content sync paths.
 *
 * Cross-references: scripts/scan-secret-misuse.ts, scripts/security-audit.ts,
 * tests/unit/hooks/defense-in-depth.test.ts
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("Content sync security surface", () => {
  it("sync-content-state.server.ts does not import client-only stores unsafely", async () => {
    const source = await fs.readFile(
      path.resolve("src/content/sync-content-state.server.ts"),
      "utf-8",
    );
    expect(source).not.toMatch(/from\s+["']@src\/content\/index["']/);
    expect(source).toMatch(/content-registry\.svelte/);
    expect(source).toMatch(/source:\s*"builder"|source:\s*'builder'/);
  });

  it("collectionbuilder.server.ts delegates saves to executeGuiStructureSave (no fullReload path)", async () => {
    const source = await fs.readFile(
      path.resolve("src/routes/(app)/config/collectionbuilder/collectionbuilder.server.ts"),
      "utf-8",
    );
    expect(source).toMatch(/executeGuiStructureSave/);
    expect(source).toMatch(/hasCollectionBuilderPermission/);
    expect(source).not.toMatch(/fullReload/);

    // Unified gui-save path lives in the local server bridge
    const localSource = await fs.readFile(
      path.resolve("src/routes/(app)/config/collectionbuilder/collectionbuilder-local.server.ts"),
      "utf-8",
    );
    expect(localSource).toMatch(/saveGuiStructure/);
    expect(localSource).toMatch(/getCollectionBuilderCms/);
  });

  it("tenant manifest paths isolate organizational data per tenant", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "svelty-tenant-manifest-"));
    tempRoots.push(root);
    await fs.mkdir(path.join(root, ".compiledCollections", "tenant-a"), { recursive: true });
    await fs.mkdir(path.join(root, ".compiledCollections", "tenant-b"), { recursive: true });

    const cwd = process.cwd();
    process.chdir(root);
    try {
      const { setOrganizationalManifest, getStructureNodes } =
        await import("@utils/collection-order.server");

      await setOrganizationalManifest(
        { posts: 1 },
        [{ _id: "cat-a", name: "A", nodeType: "category", path: "/a", source: "builder" }],
        "tenant-a",
      );
      await setOrganizationalManifest(
        { pages: 2 },
        [{ _id: "cat-b", name: "B", nodeType: "category", path: "/b", source: "builder" }],
        "tenant-b",
      );

      const aNodes = await getStructureNodes("tenant-a");
      const bNodes = await getStructureNodes("tenant-b");
      expect(aNodes[0]?._id).toBe("cat-a");
      expect(bNodes[0]?._id).toBe("cat-b");
      expect(aNodes[0]?._id).not.toBe(bNodes[0]?._id);
    } finally {
      process.chdir(cwd);
    }
  });
});

describe("Static security scanners (content sync scope)", () => {
  it("content sync modules avoid forbidden secret key literals", async () => {
    const files = [
      "src/content/sync-content-state.server.ts",
      "src/routes/(app)/config/collectionbuilder/collectionbuilder.server.ts",
      "src/utils/collection-order.server.ts",
    ];
    const forbidden = ["JWT_SECRET_KEY", "DB_PASSWORD", "ENCRYPTION_KEY"];
    for (const file of files) {
      const source = await fs.readFile(path.resolve(file), "utf-8");
      for (const key of forbidden) {
        expect(source).not.toContain(key);
      }
    }
  });
});
