/**
 * @file tests/unit/ci/gate-cache.test.ts
 * @description Pins the gate cache's key composition and its clean-tree safety rules.
 *
 * The cache is the only thing that lets a push skip a gate that already passed.
 * A false hit would therefore hide a regression, so these tests fix the two
 * properties that make a hit sound: the key covers every input that changes a
 * gate's meaning, and a dirty or untracked worktree can never record or hit.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  buildKey,
  headIsRecordable,
  indexIsRecordable,
  readCache,
  writeCache,
  type GateCacheState,
} from "../../../scripts/runs/gate-cache";

const BASE = {
  tree: "a".repeat(40),
  fileHashes: { "package.json": "p", "bun.lock": "l" },
  runtime: "node24-bun1",
  env: { DB_TYPE: "sqlite", TEST_MODE: "", PLAYWRIGHT_TEST: "", CI: "" },
};

describe("buildKey", () => {
  test("is deterministic for identical inputs", () => {
    expect(buildKey(BASE)).toBe(buildKey({ ...BASE }));
  });

  test("changes with the tree hash", () => {
    expect(buildKey({ ...BASE, tree: "b".repeat(40) })).not.toBe(buildKey(BASE));
  });

  test("changes when a keyed file changes", () => {
    expect(buildKey({ ...BASE, fileHashes: { ...BASE.fileHashes, "bun.lock": "other" } })).not.toBe(
      buildKey(BASE),
    );
  });

  test("changes with the runtime and the DB mode", () => {
    expect(buildKey({ ...BASE, runtime: "node26-bun2" })).not.toBe(buildKey(BASE));
    expect(buildKey({ ...BASE, env: { ...BASE.env, DB_TYPE: "postgresql" } })).not.toBe(
      buildKey(BASE),
    );
  });
});

describe("clean-tree safety", () => {
  test("HEAD results are only recordable from a clean worktree", () => {
    expect(headIsRecordable("")).toBe(true);
    expect(headIsRecordable(" M src/app.ts")).toBe(false);
    expect(headIsRecordable("?? scripts/x.ts")).toBe(false);
  });

  test("pre-commit results tolerate staged changes but not unstaged or untracked", () => {
    expect(indexIsRecordable(false, "")).toBe(true);
    expect(indexIsRecordable(true, "")).toBe(false);
    expect(indexIsRecordable(false, "scripts/x.ts")).toBe(false);
  });
});

describe("cache storage", () => {
  test("a missing or corrupt cache is a miss, never a throw", () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-cache-"));
    expect(readCache(join(dir, "missing.json")).entries).toEqual({});

    const corrupt = join(dir, "corrupt.json");
    writeFileSync(corrupt, "{not json");
    expect(readCache(corrupt).entries).toEqual({});
  });

  test("round-trips and prunes to the newest trees", () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-cache-"));
    const file = join(dir, "cache.json");
    const state: GateCacheState = { version: 1, entries: {} };
    for (let i = 0; i < 25; i++) state.entries[`key${i}`] = { gates: { check: i } };

    writeCache(file, state);
    const stored = JSON.parse(readFileSync(file, "utf8")) as GateCacheState;

    expect(Object.keys(stored.entries)).toHaveLength(20);
    expect(stored.entries.key24).toBeDefined();
    expect(stored.entries.key0).toBeUndefined();
  });
});
