/**
 * @file scripts/benchmark-matrix/prune-benchmark-results.ts
 * @description Safe automated retention & prune script for `tests/benchmarks/results/`.
 *
 * Keeps canonical benchmark ledgers (`history.sqlite`, `matrix_metrics.json`, `variance-history.json`,
 * baselines) while reclaiming thousands of inodes from orphaned individual JSON runs and terminal tables.
 *
 * Features:
 * - Retains canonical ledgers and baselines
 * - Prunes individual test output files older than retention days (default 7 days)
 * - Safe: dry-run mode via `--dry-run`, logs files pruned and bytes reclaimed
 */

import { existsSync, readdirSync, rmSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

const RESULTS_DIR = path.resolve(process.env.RESULTS_DIR ?? "tests/benchmarks/results");

/** Files that must NEVER be deleted */
const PROTECTED_FILES = new Set([
  "history.sqlite",
  "history.sqlite-wal",
  "history.sqlite-shm",
  "history.jsonl",
  "linkmap-baseline.json",
  "linkmap-initial-baseline.json",
  "linkmap-file-cache.json",
  "matrix_metrics.json",
  "structured-metrics.json",
  "variance-history.json",
]);

export interface PruneOptions {
  maxAgeDays?: number;
  dryRun?: boolean;
}

export function pruneBenchmarkResults(options: PruneOptions = {}): {
  prunedFiles: number;
  reclaimedBytes: number;
} {
  const maxAgeDays = options.maxAgeDays ?? 7;
  const dryRun = options.dryRun ?? false;
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 86_400_000;

  if (!existsSync(RESULTS_DIR)) return { prunedFiles: 0, reclaimedBytes: 0 };

  let prunedFiles = 0;
  let reclaimedBytes = 0;

  function processDir(dir: string, isRoot: boolean): void {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === "soak-logs" || entry.name === "sandbox-media") {
          processDir(fullPath, false);
        } else if (!isRoot && entry.name === path.basename(dir)) {
          if (!dryRun) rmSync(fullPath, { recursive: true, force: true });
          prunedFiles++;
        } else if (isRoot) {
          processDir(fullPath, false);
        }
        continue;
      }

      if (PROTECTED_FILES.has(entry.name) || entry.name.startsWith("gate-baseline-")) {
        continue;
      }

      try {
        const stats = statSync(fullPath);
        const ageMs = now - stats.mtimeMs;

        if (ageMs > maxAgeMs) {
          reclaimedBytes += stats.size;
          prunedFiles++;
          if (!dryRun) {
            unlinkSync(fullPath);
          }
        }
      } catch {
        /* best-effort */
      }
    }
  }

  processDir(RESULTS_DIR, true);
  return { prunedFiles, reclaimedBytes };
}

if (import.meta.main) {
  const isDryRun = process.argv.includes("--dry-run");
  const maxAgeArg = process.argv.find((arg) => arg.startsWith("--days="));
  const maxAgeDays = maxAgeArg ? parseInt(maxAgeArg.split("=")[1], 10) : 7;

  console.log(`Pruning benchmark results (retention: ${maxAgeDays} days, dry-run: ${isDryRun})...`);
  const result = pruneBenchmarkResults({ maxAgeDays, dryRun: isDryRun });
  const mb = (result.reclaimedBytes / (1024 * 1024)).toFixed(2);
  console.log(`✅ Pruned ${result.prunedFiles} files, reclaimed ${mb} MB.`);
}
