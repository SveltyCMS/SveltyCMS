/**
 * @file scripts/check/ensure-paraglide.ts
 * @description Generates the paraglide i18n output when it is missing.
 *
 * WHY THIS EXISTS
 * Every unit/security suite imports `@src/paraglide/runtime`, but `src/paraglide/**\/*.js`
 * is gitignored (see .gitignore) and none of the `test:*` scripts generated it. CI only
 * passes because .github/workflows/ci.yml runs `bun run paraglide` as its own step before
 * the test jobs. A fresh clone or a new git worktree therefore failed all 12 security test
 * files with:
 *   Error: Cannot find package '@src/paraglide/runtime' imported from src/utils/format-date.ts
 * A suite that only passes when an unrelated manual step ran first is not reproducible.
 *
 * Cost: one stat() (~1 ms) when the output exists, ~0.7 s once when it is missing.
 *
 * Features:
 * - Pure `ensureParaglideOutput` core with injected existence probe + compiler
 * - Fail-closed when the compiler reports failure, and when it reports success
 *   without producing the expected output
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

export const PARAGLIDE_OUTPUT = "src/paraglide/runtime.js";

export interface EnsureParaglideDeps {
  /** File the compiler must produce (repository-relative). */
  outputPath: string;
  /** Existence probe, injected so tests never touch the workspace. */
  exists: (path: string) => boolean;
  /** Runs the compiler and returns its exit status (non-zero = failed). */
  compile: () => number;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

/**
 * Ensures the paraglide output exists, compiling once when it does not.
 *
 * Returns the process exit code instead of exiting, so the CLI stays a thin
 * wrapper and the decision path is testable.
 */
export function ensureParaglideOutput({
  outputPath,
  exists,
  compile,
  log = console.log,
  error = console.error,
}: EnsureParaglideDeps): number {
  if (exists(outputPath)) return 0;

  log(`[ensure-paraglide] ${outputPath} missing - compiling i18n output`);
  const status = compile();

  if (status !== 0) {
    error(
      "[ensure-paraglide] compile failed. Run `bun run paraglide` manually and read its output.",
    );
    return status;
  }

  if (!exists(outputPath)) {
    error(`[ensure-paraglide] compile reported success but ${outputPath} still does not exist.`);
    return 1;
  }

  return 0;
}

if (import.meta.main) {
  process.exit(
    ensureParaglideOutput({
      outputPath: PARAGLIDE_OUTPUT,
      exists: existsSync,
      compile: () => spawnSync("bun", ["run", "paraglide"], { stdio: "inherit" }).status ?? 1,
    }),
  );
}
