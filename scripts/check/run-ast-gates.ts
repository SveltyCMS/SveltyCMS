#!/usr/bin/env bun
/**
 * @file scripts/check/run-ast-gates.ts
 * @description Runs every AST gate in one process over a single workspace read.
 *
 * `bun run check` used to spawn two processes that each read the `src` tree:
 * `lint-tenant-scope` and `check-linkmap`. They now share one `SourceFile` pass:
 * the linkmap consumes the preloaded text, and the tenant-scope lint receives the
 * same array. Both rules stay independently runnable for debugging.
 *
 * Features:
 * - One read of the `src` tree (TypeScript and Svelte) for both gates
 * - Linkmap incremental extraction cache (unchanged files are not re-parsed)
 * - Same ratchet as `analyze-linkmap --check` (hard counters, advisories, public API)
 * - Exit 1 with a merged violation list when either gate fails
 */

import { loadWorkspaceSources } from "../lint/lib/workspace-sources";
import { findTenantScopeConflicts, type TenantScopeOffense } from "../lint/lint-tenant-scope";
import {
  analyzeWorkspaceLinkmap,
  evaluateAgainstBaseline,
  getLastLinkmapCacheStats,
  type LinkmapReport,
} from "./analyze-linkmap";

export interface AstGateReport {
  ok: boolean;
  tenantScopeOffenses: TenantScopeOffense[];
  linkmap: LinkmapReport;
  violations: string[];
}

/**
 * Pure orchestration core (fixtures call this without starting the CLI).
 */
export function runAstGates(root = process.cwd()): AstGateReport {
  const sources = loadWorkspaceSources(root);
  const scopedSources = sources.map(({ path, source }) => ({ path, source }));
  const tenantScopeOffenses = findTenantScopeConflicts(scopedSources);
  const linkmap = analyzeWorkspaceLinkmap(root, { sources });
  const evaluation = evaluateAgainstBaseline(root, linkmap);

  const violations: string[] = [];
  for (const offense of tenantScopeOffenses) {
    violations.push(`tenant-scope ${offense.file}:${offense.line} — ${offense.detail}`);
  }
  if (evaluation && !evaluation.gate.passed) {
    violations.push(...evaluation.gate.violations);
  }

  return {
    ok: violations.length === 0,
    tenantScopeOffenses,
    linkmap,
    violations,
  };
}

if (import.meta.main) {
  const startedAt = Date.now();
  const result = runAstGates();
  const { summary } = result.linkmap;
  const stats = getLastLinkmapCacheStats();

  console.log(
    `🗺️  AST gates — ${summary.totalFiles} source files (${stats.hits} cached, ${stats.misses} parsed)`,
  );
  console.log(
    `  cycles=${summary.runtimeCycleCount} passThroughBarrels=${summary.passThroughBarrelCount} clientLeaks=${summary.clientServerLeakCount} publicApiBarrels=${summary.publicApiBarrelPaths.length}`,
  );
  if (summary.smellSummary) {
    console.log(
      `  advisories: crossRoute=${summary.smellSummary.crossRouteSmugglings} deepRel=${summary.smellSummary.deepRelativeImports} zombie=${summary.smellSummary.zombieIslands} boundary=${summary.smellSummary.clientBoundaryCandidates}`,
    );
  }
  console.log(`  tenant-scope violations: ${result.tenantScopeOffenses.length}`);

  if (!result.ok) {
    console.error(`\n❌ AST gates failed (${result.violations.length}):`);
    for (const violation of result.violations.slice(0, 40)) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }

  console.log(`\n✅ AST gates passed in ${Date.now() - startedAt}ms.`);
}
