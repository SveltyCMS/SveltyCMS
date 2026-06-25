/**
 * @file src/utils/benchmark-paths.ts
 * @description Canonical filesystem boundaries between user live collection data and benchmark/test fixtures.
 *
 * ### User live data (never touched by benchmarks)
 * - `config/collections/*.ts` — excluding `test/`
 * - `.compiledCollections/*.js` — excluding `test/`
 *
 * ### Benchmark / test data (isolated)
 * - `config/collections/test/<workspace>/`
 * - `.compiledCollections/test/<workspace>/`
 *
 * ### Features:
 * - workspace prepare / cleanup helpers
 * - path guards for compile and scanner layers
 * - legacy root debris directory list
 */

import fs from "node:fs/promises";
import path from "node:path";

export const USER_COLLECTIONS_DIR = path.resolve(process.cwd(), "config", "collections");
export const BENCHMARK_COLLECTIONS_DIR = path.join(USER_COLLECTIONS_DIR, "test");
export const USER_COMPILED_DIR = path.resolve(process.cwd(), ".compiledCollections");
export const BENCHMARK_COMPILED_DIR = path.join(USER_COMPILED_DIR, "test");

/** Benchmark dirs that must never remain at the compiled root. */
export const LEGACY_COMPILED_BENCHMARK_DIRS = ["nested", "batch_bench"] as const;

export interface BenchmarkWorkspace {
  name: string;
  source: string;
  compiled: string;
}

/** Resolves an isolated benchmark workspace under `test/`. */
export function getBenchmarkWorkspace(name: string): BenchmarkWorkspace {
  const safe = name.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  return {
    name: safe,
    source: path.join(BENCHMARK_COLLECTIONS_DIR, safe),
    compiled: path.join(BENCHMARK_COMPILED_DIR, safe),
  };
}

/** True when a path is under benchmark source or compiled trees. */
export function isUnderBenchmarkPath(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  for (const root of [BENCHMARK_COMPILED_DIR, BENCHMARK_COLLECTIONS_DIR]) {
    const base = path.normalize(root);
    if (normalized === base || normalized.startsWith(base + path.sep)) return true;
  }
  return false;
}

/** True when a compiled/source relative path is inside `test/`. */
export function isBenchmarkRelativePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  return normalized === "test" || normalized.startsWith("test/");
}

/**
 * Prepares an isolated compiled workspace (wipes prior contents).
 * User files at `.compiledCollections/` root are preserved.
 */
export async function prepareBenchmarkCompiledWorkspace(name: string): Promise<BenchmarkWorkspace> {
  const ws = getBenchmarkWorkspace(name);
  await fs.mkdir(path.dirname(ws.compiled), { recursive: true });
  await fs.rm(ws.compiled, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(ws.compiled, { recursive: true });
  return ws;
}

/** Removes one benchmark workspace without touching user live data. */
export async function cleanupBenchmarkCompiledWorkspace(name: string): Promise<void> {
  const ws = getBenchmarkWorkspace(name);
  await fs.rm(ws.compiled, { recursive: true, force: true }).catch(() => {});
}

/**
 * Wipes all benchmark trees and legacy root debris.
 * Does not delete user collection files at config/collections root or .compiledCollections root.
 */
export async function cleanupAllBenchmarkWorkspaces(): Promise<number> {
  let removed = 0;

  async function countAndRm(target: string): Promise<void> {
    try {
      const stat = await fs.stat(target);
      if (stat.isDirectory()) {
        const entries = await fs.readdir(target, { withFileTypes: true });
        for (const entry of entries) {
          await countAndRm(path.join(target, entry.name));
        }
        await fs.rmdir(target).catch(() => fs.rm(target, { recursive: true, force: true }));
      } else {
        await fs.unlink(target);
      }
      removed++;
    } catch {
      /* absent */
    }
  }

  await countAndRm(BENCHMARK_COMPILED_DIR).catch(() => {});
  await countAndRm(BENCHMARK_COLLECTIONS_DIR).catch(() => {});
  await fs.mkdir(BENCHMARK_COMPILED_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(BENCHMARK_COLLECTIONS_DIR, { recursive: true }).catch(() => {});

  for (const legacy of LEGACY_COMPILED_BENCHMARK_DIRS) {
    await countAndRm(path.join(USER_COMPILED_DIR, legacy)).catch(() => {});
  }

  return removed;
}
