#!/usr/bin/env bun
/**
 * @file scripts/check/run-source-lints.ts
 * @description The twelve source linters in one process over one workspace read.
 *
 * Twelve rules share this gate. Five of them were folded in first; `lint-design`,
 * `lint-duplicate-testids`, `scan-anonymous-leaks` and `lint-rule-budgets` used
 * to be their own `FAST_CHECKS` entries, so every run paid four extra process
 * spawns and four extra tree reads. All twelve now share
 * `loadWorkspaceSources()` — one read for all nine — while staying a separate
 * registry entry from `check-ast-gates`. Keeping them separate preserves
 * wall-clock parallelism: the runner executes this gate and the module-graph
 * linkmap concurrently, so the total is `max(lint, linkmap)` rather than their
 * sum. Two processes, one read each, instead of six processes and six reads.
 *
 * The tree is read once in its inclusive view (Paraglide output and `.d.ts`
 * mirrors included) because the rule-budget ratchet must count exactly what
 * `readSourceFiles()` counts; every other rule runs over the filtered subset
 * derived from that same read.
 *
 * The linters' standalone scripts remain runnable for debugging; this module is
 * the gate that `bun run check` executes.
 *
 * ### Features:
 * - single workspace read shared by all twelve rules
 * - one aggregated violation list with per-rule prefixes, deterministic order
 * - exported pure core for fixture tests (disk inputs are injectable)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  filterWorkspaceSources,
  loadWorkspaceSources,
  type WorkspaceSourceFile,
} from "../lint/lib/workspace-sources";
import { findDirectIsoNow, type DateCallOffense } from "../lint/lint-date-helpers";
import { findSilentCatches, type SilentCatchOffense } from "../lint/lint-silent-catch";
import { findLivePathReferences, type LivePathOffense } from "../lint/lint-live-paths";
import {
  findUnclassifiedDeletes,
  type TransientOffense,
} from "../lint/lint-transient-classification";
import { findUnsafeModuleTimers, type TimerOffense } from "../lint/lint-global-timers";
import { findDuplicateTestIds, type TestIdOffense } from "../lint/lint-duplicate-testids";
import { scanAnonymousLeaks, type AnonymousLeak } from "../lint/scan-anonymous-leaks";
import {
  findDesignViolations,
  loadDesignCssSources,
  type DesignLintResult,
} from "../lint/lint-design";
import {
  findRemoteTransportOffenses,
  type RemoteTransportOffense,
} from "../lint/scan-remote-transport";
import { findLocaleFormatCalls, type LocaleFormatOffense } from "../lint/lint-locale-format";
import { findCssTokenOffenses, type CssTokenOffense } from "../lint/lint-css-tokens";
import { findUnguardedClickAway, type ClickAwayOffense } from "../lint/lint-click-away";
import {
  BUDGET_BASELINE_RELATIVE_PATH,
  checkRuleBudgets,
  formatBudgetViolation,
  loadBudgetBaseline,
  type BudgetBaseline,
  type BudgetViolation,
} from "../lint/lint-rule-budgets";

export interface SourceLintReport {
  ok: boolean;
  dateCallOffenses: DateCallOffense[];
  silentCatchOffenses: SilentCatchOffense[];
  livePathOffenses: LivePathOffense[];
  transientOffenses: TransientOffense[];
  timerOffenses: TimerOffense[];
  duplicateTestIdOffenses: TestIdOffense[];
  anonymousLeakOffenses: AnonymousLeak[];
  remoteTransportOffenses: RemoteTransportOffense[];
  localeFormatOffenses: LocaleFormatOffense[];
  cssTokenOffenses: CssTokenOffense[];
  clickAwayOffenses: ClickAwayOffense[];
  designResult: DesignLintResult;
  budgetViolations: BudgetViolation[];
  /** The ratchet file was unreadable, so the budget rule failed closed. */
  budgetBaselineMissing: boolean;
  violations: string[];
}

export interface SourceLintOptions {
  /**
   * Inclusive `src` tree read (Paraglide output + `.d.ts` mirrors included) for
   * the budget ratchet. Defaults to `sources`, i.e. the filtered view.
   */
  budgetSources?: readonly WorkspaceSourceFile[];
  /**
   * Recorded ratchet. Defaults to `scripts/lint/rule-budgets.json`; pass `null`
   * to assert the missing-baseline failure path.
   */
  budgetBaseline?: BudgetBaseline | null;
  /** Stylesheet sources defining `preset-*` tokens. Defaults to app.css + utilities.css. */
  designCssSources?: readonly WorkspaceSourceFile[];
  /** Cross-file module reader for the anonymous-leak rule (must skip the shared set). */
  readExtraSource?: (path: string) => string | null;
}

/** The anonymous-leak rule only models route modules and `.remote.ts` files. */
export function selectAnonymousLeakTargets(
  files: readonly WorkspaceSourceFile[],
): WorkspaceSourceFile[] {
  return files.filter(
    (file) =>
      file.path.endsWith(".ts") &&
      (file.path.startsWith("src/routes/") || file.path.endsWith(".remote.ts")),
  );
}

function designViolationCount(design: DesignLintResult): number {
  return (
    design.deadClassOffenses.length +
    design.unresolvedPresetOffenses.length +
    design.cardViolations.length +
    (design.missingDynamic.length > 0 ? 1 : 0)
  );
}

/**
 * Pure core: run every source rule over an already-loaded workspace.
 *
 * The caller owns the file set. `run-fast-checks` reads the tree in its
 * inclusive view, derives the filtered view for the source rules, and passes
 * the inclusive list separately for the budget ratchet; the filtered view
 * cannot contain an executable statement these rules match (Paraglide output
 * and `.d.ts` mirrors are generated).
 */
export function runSourceLints(
  sources: readonly WorkspaceSourceFile[],
  options: SourceLintOptions = {},
): SourceLintReport {
  const files = sources.map(({ path, source }) => ({ path, source }));
  const dateCallOffenses = findDirectIsoNow(files);
  const localeFormatOffenses = findLocaleFormatCalls(files);
  const clickAwayOffenses = findUnguardedClickAway(files);
  const silentCatchOffenses = findSilentCatches(files);
  const livePathOffenses = findLivePathReferences(files);
  const transientOffenses = findUnclassifiedDeletes(files);
  const timerOffenses = findUnsafeModuleTimers(files);

  const duplicateTestIdOffenses = findDuplicateTestIds(
    files.filter((file) => file.path.endsWith(".svelte")),
  );

  const anonymousLeakOffenses = scanAnonymousLeaks(
    selectAnonymousLeakTargets(files),
    options.readExtraSource,
  );

  const remoteTransportOffenses = findRemoteTransportOffenses(
    files.filter((file) => file.path.endsWith(".remote.ts")),
  );

  const designResult = findDesignViolations(
    files.filter(
      (file) =>
        file.path.endsWith(".svelte") || file.path.endsWith(".ts") || file.path.endsWith(".js"),
    ),
    options.designCssSources ?? loadDesignCssSources(),
  );

  const cssTokenOffenses = findCssTokenOffenses(
    files,
    options.designCssSources ?? loadDesignCssSources(),
  );

  const budgetFiles = (options.budgetSources ?? sources).map(({ path, source }) => ({
    path,
    source,
  }));
  const budgetBaseline =
    options.budgetBaseline === undefined ? loadBudgetBaseline() : options.budgetBaseline;
  const budgetViolations =
    budgetBaseline === null ? [] : checkRuleBudgets(budgetFiles, budgetBaseline);

  const violations: string[] = [];
  for (const offense of dateCallOffenses) {
    violations.push(
      `date-helpers ${offense.file}:${offense.line} — direct new Date().toISOString()`,
    );
  }
  for (const offense of localeFormatOffenses) {
    violations.push(
      `locale-format ${offense.file}:${offense.line} — ${offense.call}() bypasses @utils/format-date`,
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
  for (const offense of duplicateTestIdOffenses) {
    violations.push(
      `duplicate-testids ${offense.file}:${offense.line} — <${offense.tag} data-testid="${offense.testId}"> already rendered by ${offense.declaredIn}`,
    );
  }
  for (const offense of remoteTransportOffenses) {
    violations.push(
      `remote-transport ${offense.file}:${offense.line} — ${offense.name}: ${offense.reason}`,
    );
  }
  for (const leak of anonymousLeakOffenses) {
    violations.push(
      `anonymous-leaks ${leak.file}:${leak.line} — ${leak.key} in ${leak.handler}: ${leak.reason}`,
    );
  }
  for (const offense of designResult.deadClassOffenses) {
    violations.push(`design ${offense.file}:${offense.line} — ${offense.reason}`);
  }
  for (const offense of designResult.unresolvedPresetOffenses) {
    violations.push(`design ${offense.file}:${offense.line} — undefined preset '${offense.name}'`);
  }
  for (const offense of cssTokenOffenses) {
    violations.push(`css-tokens ${offense.file}:${offense.line} — ${offense.reason}`);
  }
  for (const offense of clickAwayOffenses) {
    violations.push(`click-away ${offense.file}:${offense.line} — ${offense.reason}`);
  }
  for (const violation of designResult.cardViolations) {
    violations.push(
      `design ${violation.file}:${violation.line} — AdminCard ${violation.attribute}`,
    );
  }
  for (const offense of designResult.nestedStyleOffenses) {
    violations.push(`design ${offense.file}:${offense.line} — ${offense.reason}`);
  }
  if (designResult.missingDynamic.length > 0) {
    violations.push(
      `design src/app.css — missing dynamic color recipes: ${designResult.missingDynamic.join(", ")}`,
    );
  }
  if (budgetBaseline === null) {
    violations.push(
      `rule-budgets ${BUDGET_BASELINE_RELATIVE_PATH} — missing baseline (run: bun run scripts/lint/lint-rule-budgets.ts --update)`,
    );
  }
  for (const violation of budgetViolations) {
    violations.push(`rule-budgets ${formatBudgetViolation(violation)}`);
  }

  return {
    ok: violations.length === 0,
    remoteTransportOffenses,
    dateCallOffenses,
    localeFormatOffenses,
    cssTokenOffenses,
    clickAwayOffenses,
    silentCatchOffenses,
    livePathOffenses,
    transientOffenses,
    timerOffenses,
    duplicateTestIdOffenses,
    anonymousLeakOffenses,
    designResult,
    budgetViolations,
    budgetBaselineMissing: budgetBaseline === null,
    violations,
  };
}

if (import.meta.main) {
  const startedAt = Date.now();
  const root = process.cwd();
  // One tree read: the budget ratchet needs the inclusive view, and everything
  // else runs over the filtered subset derived from the same array.
  const inclusiveSources = loadWorkspaceSources(root, { inclusive: true });
  const sources = filterWorkspaceSources(inclusiveSources);

  const anonymousLeakFiles = selectAnonymousLeakTargets(sources);
  const onDisk = new Set(anonymousLeakFiles.map((file) => file.path));
  const readExtraSource = (path: string): string | null => {
    if (onDisk.has(path)) return null; // already modelled
    try {
      return readFileSync(join(root, path), "utf8");
    } catch {
      return null; // catch-allow: an unresolvable module simply ends cross-file analysis
    }
  };

  const result = runSourceLints(sources, {
    budgetSources: inclusiveSources,
    budgetBaseline: loadBudgetBaseline(root),
    designCssSources: loadDesignCssSources(root),
    readExtraSource,
  });

  console.log(
    `🧹 Source lints — ${sources.length} files (${inclusiveSources.length} with generated)`,
  );
  console.log(
    `  date-helpers=${result.dateCallOffenses.length} locale-format=${result.localeFormatOffenses.length} css-tokens=${result.cssTokenOffenses.length} click-away=${result.clickAwayOffenses.length} silent-catch=${result.silentCatchOffenses.length} live-paths=${result.livePathOffenses.length} transient=${result.transientOffenses.length} global-timers=${result.timerOffenses.length} duplicate-testids=${result.duplicateTestIdOffenses.length} anonymous-leaks=${result.anonymousLeakOffenses.length} design=${designViolationCount(result.designResult)} rule-budgets=${
      result.budgetViolations.length + (result.budgetBaselineMissing ? 1 : 0)
    }`,
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
