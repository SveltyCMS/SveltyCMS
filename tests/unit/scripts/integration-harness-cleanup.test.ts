/**
 * @file tests/unit/scripts/integration-harness-cleanup.test.ts
 * @description Guard: `cleanupTestArtifacts` sweeps harness-classified SQLite
 * leftovers out of the live `config/database/` folder while never touching
 * live-named files, and sweeps tenant-scoped `test-collections` directories
 * (e.g. `config/global/test-collections`) while never touching the sibling
 * live `collections` directories — the invariant that harness artifacts stay
 * in `test-*` roots.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupTestArtifacts } from "../../../scripts/integration-harness.ts";

describe("integration harness cleanup — live folder protection", () => {
  let root: string;
  const liveDir = () => join(root, "config", "database");

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "svelty-int-cleanup-"));
    mkdirSync(liveDir(), { recursive: true });
    mkdirSync(join(root, "config", "test-database"), { recursive: true });
    writeFileSync(join(root, "config", "private.test.ts"), "export const privateEnv = {};\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("removes harness DB shells (+ WAL sidecars) and keeps live-named files", () => {
    const harnessFiles = [
      "sveltycms_test.sqlite",
      "sveltycms_test.sqlite-wal",
      "sveltycms_test.sqlite-shm",
      "e2e_auth_test.sqlite",
      "bench_parent.db",
    ];
    // Live-named/scratch files: classifier says "not a harness DB" — must survive.
    const protectedFiles = [
      "sveltycms.db",
      "sveltycms.db.sqlite",
      "probe_plainA.sqlite",
      "notes.txt",
    ];
    for (const f of [...harnessFiles, ...protectedFiles]) writeFileSync(join(liveDir(), f), "x");

    cleanupTestArtifacts(root);

    for (const f of harnessFiles) expect(existsSync(join(liveDir(), f)), f).toBe(false);
    for (const f of protectedFiles) expect(existsSync(join(liveDir(), f)), f).toBe(true);
    // Existing cleanup contract: generated config + test folders are removed.
    expect(existsSync(join(root, "config", "private.test.ts"))).toBe(false);
    expect(existsSync(join(root, "config", "test-database"))).toBe(false);
  });

  it("sweeps tenant-scoped test-collections dirs and keeps sibling live collections", () => {
    // Tenant-scoped test leftovers: builder category dirs created by the
    // content-nodes contract suite under the `global` tenant.
    mkdirSync(join(root, "config", "global", "test-collections", "contract-gui-x"), {
      recursive: true,
    });
    writeFileSync(
      join(root, "config", "global", "test-collections", "contract-gui-x", "schema.ts"),
      "x",
    );
    // The sibling live dir of the same tenant must never be touched.
    mkdirSync(join(root, "config", "global", "collections", "live-category"), {
      recursive: true,
    });
    writeFileSync(
      join(root, "config", "global", "collections", "live-category", "posts.ts"),
      "live",
    );
    // A second tenant exercises the sweep across all config/* entries.
    mkdirSync(join(root, "config", "tenant-42", "test-collections", "bench-x"), {
      recursive: true,
    });

    cleanupTestArtifacts(root);

    expect(existsSync(join(root, "config", "global", "test-collections"))).toBe(false);
    expect(existsSync(join(root, "config", "tenant-42", "test-collections"))).toBe(false);
    expect(
      existsSync(join(root, "config", "global", "collections", "live-category", "posts.ts")),
    ).toBe(true);
  });
});
