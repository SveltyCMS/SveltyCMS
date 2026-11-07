#!/usr/bin/env bun
/**
 * @file scripts/runs/gate-cache.ts
 * @description Remembers which gates already passed for an exact tree, so a
 * push does not repeat a `check`, coverage, integration or E2E run that the
 * identical tree already survived.
 *
 * The hooks were stateless: pre-commit validated the tree, and pre-push then
 * re-ran the same gates on the same bytes (measured 2026-11-07: 58s `check` +
 * 4m02s coverage + 24s components re-executed on an unchanged tree). This cache
 * keys a gate result on the Git tree hash plus the files that can change a
 * gate's meaning (manifest, lockfile, Vitest/Playwright configs, Node/Bun
 * runtime, DB mode).
 *
 * ### Safety rules
 * - A dirty worktree never produces a hit: every gate reads the filesystem, so
 *   a recorded result only describes a tree when tracked files match it.
 * - Untracked files also block a hit — `tsc` and the test runner can read them.
 * - The cache lives inside `.git/`, so it is never committed and is safe to
 *   delete (`--clear`) to force a full run.
 *
 * ### CLI
 *   gate-cache.ts hit <gate>              # exit 0 when the current tree passed it
 *   gate-cache.ts record <gate>           # record against HEAD's tree
 *   gate-cache.ts record --index <gate>   # record against the index (pre-commit)
 *   gate-cache.ts key                     # print the current cache key
 *   gate-cache.ts clear                   # drop every entry
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CACHE_VERSION = 1;
const MAX_TREES = 20;

/** Files whose content changes what the gates mean. */
const KEYED_FILES = [
  "package.json",
  "bun.lock",
  "vitest.config.ts",
  "vitest.dom.config.ts",
  "playwright.config.ts",
  "scripts/test/coverage-budget.json",
] as const;

/** Environment that selects a different test execution. */
const KEYED_ENV = ["DB_TYPE", "TEST_MODE", "PLAYWRIGHT_TEST", "CI"] as const;

export interface GateCacheState {
  version: number;
  entries: Record<string, { gates: Record<string, number> }>;
}

function git(args: readonly string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    shell: false,
  }).trim();
}

function gitQuiet(args: readonly string[]): boolean {
  try {
    execFileSync("git", args, { stdio: "ignore", shell: false });
    return true;
  } catch {
    return false;
  }
}

export function buildKey(input: {
  tree: string;
  fileHashes: Record<string, string>;
  runtime: string;
  env: Record<string, string>;
}): string {
  const hash = createHash("sha256").update(`v${CACHE_VERSION}`);
  hash.update(input.tree);
  hash.update(input.runtime);
  for (const [name, value] of Object.entries(input.fileHashes).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    hash.update(`${name}:${value}`);
  }
  for (const name of KEYED_ENV) hash.update(`${name}=${input.env[name] ?? ""}`);
  return hash.digest("hex").slice(0, 24);
}

export function readCache(file: string): GateCacheState {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as GateCacheState;
    if (parsed?.version === CACHE_VERSION && parsed.entries) return parsed;
  } catch {
    // Missing or corrupt cache is a miss, never a failure.
  }
  return { version: CACHE_VERSION, entries: {} };
}

export function writeCache(file: string, state: GateCacheState): void {
  const newestFirst = Object.entries(state.entries)
    .map(([key, entry]) => ({ key, entry, at: Math.max(0, ...Object.values(entry.gates)) }))
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_TREES);
  const pruned: GateCacheState = { version: CACHE_VERSION, entries: {} };
  for (const { key, entry } of newestFirst) pruned.entries[key] = entry;
  writeFileSync(file, `${JSON.stringify(pruned, null, 2)}\n`, "utf8");
}

function cacheFile(): string {
  if (process.env.SVELTY_GATE_CACHE) return process.env.SVELTY_GATE_CACHE;
  return join(git(["rev-parse", "--absolute-git-dir"]), "svelty-gate-cache.json");
}

function fileHashes(): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const file of KEYED_FILES) {
    hashes[file] = existsSync(file)
      ? createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16)
      : "missing";
  }
  return hashes;
}

function currentKey(tree: string): string {
  const env: Record<string, string> = {};
  for (const name of KEYED_ENV) env[name] = process.env[name] ?? "";
  return buildKey({
    tree,
    fileHashes: fileHashes(),
    runtime: `node${process.versions.node}-bun${process.versions.bun ?? "none"}`,
    env,
  });
}

/** A gate ran on the worktree, so only a fully clean tree can vouch for HEAD. */
export function headIsRecordable(statusPorcelain: string): boolean {
  return statusPorcelain.length === 0;
}

/** Pre-commit: staged changes are expected, unstaged/untracked ones are not. */
export function indexIsRecordable(unstagedDiff: boolean, untracked: string): boolean {
  return !unstagedDiff && untracked.length === 0;
}

function main(): number {
  const [command, ...rest] = process.argv.slice(2);
  const file = cacheFile();

  if (command === "clear") {
    writeCache(file, { version: CACHE_VERSION, entries: {} });
    console.log("gate-cache cleared");
    return 0;
  }

  if (command === "key") {
    console.log(currentKey(git(["rev-parse", "HEAD^{tree}"])));
    return 0;
  }

  if (command === "hit") {
    const gate = rest[0];
    if (!gate || !headIsRecordable(git(["status", "--porcelain"]))) return 1;
    const key = currentKey(git(["rev-parse", "HEAD^{tree}"]));
    return readCache(file).entries[key]?.gates[gate] ? 0 : 1;
  }

  if (command === "record") {
    const useIndex = rest.includes("--index");
    const gate = rest.find((arg) => arg !== "--index");
    if (!gate) return 1;

    const recordable = useIndex
      ? indexIsRecordable(!gitQuiet(["diff", "--quiet"]), git(["ls-files", "--others"]))
      : headIsRecordable(git(["status", "--porcelain"]));
    if (!recordable) return 0;

    const tree = useIndex ? git(["write-tree"]) : git(["rev-parse", "HEAD^{tree}"]);
    const state = readCache(file);
    const key = currentKey(tree);
    state.entries[key] ??= { gates: {} };
    state.entries[key].gates[gate] = Date.now();
    writeCache(file, state);
    return 0;
  }

  console.error("usage: gate-cache.ts <hit|record|key|clear> …");
  return 2;
}

if (import.meta.main) process.exit(main());
