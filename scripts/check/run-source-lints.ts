#!/usr/bin/env bun
/**
 * @file scripts/check/run-source-lints.ts
 * @description The five source linters in one process over one workspace read.
 *
 * These rules used to be five `FAST_CHECKS` entries, so every run paid five
 * process spawns and five full `src` tree reads. They now share
 * `loadWorkspaceSources()` — one read for all five — while staying a separate
 * registry entry from `check-ast-gates`. Keeping them separate preserves
 * wall-clock parallelism: the runner executes this gate and the module-graph
 * linkmap concurrently, so the total is `max(lint, linkmap)` rather than their
 * sum. Two processes, one read each, instead of six processes and six reads.
 *
 * The linters' standalone scripts remain runnable for debugging; this module is
 * the gate that `bun run check` executes.
 *
 * ### Features:
 * - single workspace read shared by all five rules
 * - one aggregated violation list with per-rule prefixes
 * - exported pure core for fixture tests
 */

import { loadWorkspaceSources, type WorkspaceSourceFile } from "../lint/lib/workspace-sources";
import { findDirectIsoNow, type DateCallOffense } from "../lint/lint-date-helpers";
import { findSilentCatches, type SilentCatchOffense } from "../lint/lint-silent-catch";
import { findLivePathReferences, type LivePathOffense } from "../lint/lint-live-paths";
import {
  findUnclassifiedDeletes,
  type TransientOffense,
} from "../lint/lint-transient-classification";
import { findUnsafeModuleTimers, type TimerOffense } from "../lint/lint-global-timers";

export interface SourceLintReport {
  ok: boolean;
  dateCallOffenses: DateCallOffense[];
  silentCatchOffenses: SilentCatchOffense[];
  livePathOffenses: LivePathOffense[];
  transientOffenses: TransientOffense[];
  timerOffenses: TimerOffense[];
  violations: string[];
}

/**
 * Pure core: run every source rule over an already-loaded workspace.
 *
 * The caller owns the file set. `run-fast-checks` feeds the shared
 * `loadWorkspaceSources()` list (which excludes Paraglide output and `.d.ts`
 * mirrors); neither can contain an executable statement these rules match.
 */
export function runSourceLints(sources: readonly WorkspaceSourceFile[]): SourceLintReport {
  const files = sources.map(({ path, source }) => ({ path, source }));
  const dateCallOffenses = findDirectIsoNow(files);
  const silentCatchOffenses = findSilentCatches(files);
  const livePathOffenses = findLivePathReferences(files);
  const transientOffenses = findUnclassifiedDeletes(files);
  const timerOffenses = findUnsafeModuleTimers(files);

  const violations: string[] = [];
  for (const offense of dateCallOffenses) {
    violations.push(
      `date-helpers ${offense.file}:${offense.line} — direct new Date().toISOString()`,
    );
  }
  for (const offense of silentCatchOffenses) {
    violations.push(`silent-catch ${offense.file}:${offense.line} — empty catch block`);
  }
  for (const offense of livePathOffenses) {
    violations.push(
      `live-paths ${offense.file}:${offense.line} — unescaped live path constant '${offense.match}'`,
    );
  }
  for (const offense of transientOffenses) {
    violations.push(
      `transient-classification ${offense.file}:${offense.line} — unclassified delete call '${offense.call}'`,
    );
  }
  for (const offense of timerOffenses) {
    violations.push(
      `global-timers ${offense.file}:${offense.line} — timer '${offense.timer}' ${offense.reason}`,
    );
  }

  return {
    ok: violations.length === 0,
    dateCallOffenses,
    silentCatchOffenses,
    livePathOffenses,
    transientOffenses,
    timerOffenses,
    violations,
  };
}

if (import.meta.main) {
  const startedAt = Date.now();
  const sources = loadWorkspaceSources(process.cwd());
  const result = runSourceLints(sources);

  console.log(`🧹 Source lints — ${sources.length} files`);
  console.log(
    `  date-helpers=${result.dateCallOffenses.length} silent-catch=${result.silentCatchOffenses.length} live-paths=${result.livePathOffenses.length} transient=${result.transientOffenses.length} global-timers=${result.timerOffenses.length}`,
  );

  if (!result.ok) {
    console.error(`\n❌ Source lints failed (${result.violations.length}):`);
    for (const violation of result.violations.slice(0, 40)) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }

  console.log(`\n✅ Source lints passed in ${Date.now() - startedAt}ms.`);
}
