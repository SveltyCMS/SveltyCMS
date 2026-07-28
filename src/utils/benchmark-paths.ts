/**
 * @file src/utils/benchmark-paths.ts
 * @description Canonical filesystem boundaries for benchmark/test fixtures.
 *
 * ### Architecture (audit 2026-07):
 * All path constants now delegate to `path-resolver.ts` — single source of truth.
 * This file exists for backward compatibility with 10+ existing consumers.
 *
 * ### User live data (never touched by benchmarks)
 * - `config/collections/*.ts`
 * - `.compiledCollections/*.js`
 *
 * ### Benchmark/test fixtures
 * - `config/test-collections/`
 * - `.compiledCollections/test-collections/`
 */

import fs from "node:fs/promises";
import path from "node:path";
import { paths } from "./path-resolver";

// ─── Backward-compatible re-exports from path-resolver ────────────────

export const USER_COLLECTIONS_DIR = paths.collections;
export const BENCHMARK_COLLECTIONS_DIR = paths.benchmark.collections;
export const USER_COMPILED_DIR = paths.compiledCollections;
export const BENCHMARK_COMPILED_DIR = paths.benchmark.compiled;
export const LEGACY_COMPILED_BENCHMARK_DIRS = ["nested", "batch_bench"] as const;

export interface BenchmarkWorkspace {
  name: string;
  source: string;
  compiled: string;
}

/** 🛡️ Sanitizes workspace name to prevent path traversal via `../` */
export function getBenchmarkWorkspace(name: string): BenchmarkWorkspace {
  const safe = path
    .basename(name)
    .replace(/[^a-z0-9_-]/gi, "_")
    .toLowerCase();
  return {
    name: safe,
    source: path.join(BENCHMARK_COLLECTIONS_DIR, safe),
    compiled: path.join(BENCHMARK_COMPILED_DIR, safe),
  };
}

export function isUnderBenchmarkPath(filePath: string): boolean {
  return (
    paths.isSafe(BENCHMARK_COMPILED_DIR, filePath) ||
    paths.isSafe(BENCHMARK_COLLECTIONS_DIR, filePath)
  );
}

export function isBenchmarkRelativePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  return normalized === "test-collections" || normalized.startsWith("test-collections/");
}

export async function prepareBenchmarkCompiledWorkspace(name: string): Promise<BenchmarkWorkspace> {
  const ws = getBenchmarkWorkspace(name);
  await fs.mkdir(path.dirname(ws.compiled), { recursive: true });
  await fs.rm(ws.compiled, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(ws.compiled, { recursive: true });
  return ws;
}

export async function cleanupBenchmarkCompiledWorkspace(name: string): Promise<void> {
  const ws = getBenchmarkWorkspace(name);
  if (paths.isSafe(BENCHMARK_COMPILED_DIR, ws.compiled)) {
    await fs.rm(ws.compiled, { recursive: true, force: true }).catch(() => {});
  }
}

export async function cleanupAllBenchmarkWorkspaces(): Promise<number> {
  let removed = 0;
  async function safeRemove(target: string): Promise<void> {
    try {
      await fs.rm(target, { recursive: true, force: true });
      removed++;
    } catch {
      /* absent */
    }
  }
  if (
    paths.isSafe(BENCHMARK_COMPILED_DIR, BENCHMARK_COMPILED_DIR) ||
    BENCHMARK_COMPILED_DIR.includes("test")
  ) {
    await safeRemove(BENCHMARK_COMPILED_DIR);
    await fs.mkdir(BENCHMARK_COMPILED_DIR, { recursive: true }).catch(() => {});
  }
  if (
    paths.isSafe(BENCHMARK_COLLECTIONS_DIR, BENCHMARK_COLLECTIONS_DIR) ||
    BENCHMARK_COLLECTIONS_DIR.includes("test")
  ) {
    await safeRemove(BENCHMARK_COLLECTIONS_DIR);
    await fs.mkdir(BENCHMARK_COLLECTIONS_DIR, { recursive: true }).catch(() => {});
  }
  for (const legacy of LEGACY_COMPILED_BENCHMARK_DIRS) {
    await safeRemove(path.join(USER_COMPILED_DIR, legacy));
  }
  return removed;
}
