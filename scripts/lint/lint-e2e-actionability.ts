/**
 * @file scripts/lint/lint-e2e-actionability.ts
 * @description Keeps Playwright actionability workarounds visible.
 *
 * `force: true` skips the browser's actionability checks, so it turns "a
 * control is obscured, disabled or detached" into a silent test pass. The policy
 * is that an obscured normal control is a **product bug**, not a test detail;
 * the only sanctioned workarounds live in `tests/e2e/helpers/` (sr-only
 * checkbox, auth/setup overlays). The same applies to fixed sleeps, which hide
 * hydration/race bugs instead of waiting for a condition.
 *
 * Rule:
 * - `.click/check/fill/…({ force: true })` outside `tests/e2e/helpers/` needs a
 *   `force-allow: <reason>` comment on the same or previous line.
 * - `waitForTimeout(...)` outside `tests/e2e/helpers/` needs a
 *   `wait-allow: <reason>` comment. Use `expect.poll`/`waitFor*`/URL waits first.
 *
 * Feature-gated `test.skip(condition, reason)` calls are legitimate and out of
 * scope; unconditional skips of control-map rows remain covered by the ADR.
 *
 * Usage:
 *   bun run scripts/lint/lint-e2e-actionability.ts [--quiet]
 * Exit code: 0 on clean, 1 on any violation.
 */

import { readFileSync, readdirSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join, relative } from "node:path";

export interface SourceFile {
  /** Project-relative POSIX path. */
  path: string;
  source: string;
}

export interface ActionabilityOffense {
  file: string;
  line: number;
  kind: "force" | "sleep";
}

const FORCE = /\.(?:click|check|uncheck|hover|fill|selectOption|setChecked)\([^)]*\bforce:\s*true/;
const SLEEP = /\bwaitForTimeout\(/;

function isComment(line: string): boolean {
  return line.trimStart().startsWith("//");
}

function hasMarker(lines: string[], index: number, marker: string): boolean {
  return lines[index]?.includes(marker) || lines[index - 1]?.includes(marker);
}

/**
 * Pure core — fixtures in `tests/unit/scripts/lint-e2e-actionability.test.ts`.
 */
export function findActionabilityWorkarounds(files: SourceFile[]): ActionabilityOffense[] {
  const offenses: ActionabilityOffense[] = [];

  for (const file of files) {
    // Helpers are the sanctioned home for these workarounds.
    if (file.path.startsWith("tests/e2e/helpers/")) continue;
    const lines = file.source.split(/\r?\n/);

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (isComment(line)) continue;

      if (FORCE.test(line) && !hasMarker(lines, index, "force-allow:")) {
        offenses.push({ file: file.path, line: index + 1, kind: "force" });
      }
      if (SLEEP.test(line) && !hasMarker(lines, index, "wait-allow:")) {
        offenses.push({ file: file.path, line: index + 1, kind: "sleep" });
      }
    }
  }

  return offenses;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function collectSpecFiles(dir: string, out: string[] = []): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectSpecFiles(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

function main(): void {
  const quiet = process.argv.includes("--quiet") || process.argv.includes("--ci");
  const root = process.cwd();
  const files: SourceFile[] = collectSpecFiles(join(root, "tests/e2e")).map((full) => ({
    path: relative(root, full).replace(/\\/g, "/"),
    source: readFileSync(full, "utf8"),
  }));

  const offenses = findActionabilityWorkarounds(files);

  if (offenses.length === 0) {
    if (!quiet) {
      console.log(`✅ E2E actionability: no unjustified force/sleep across ${files.length} files.`);
    }
    return;
  }

  console.error(`❌ unjustified E2E actionability workarounds: ${offenses.length}`);
  for (const offense of offenses) {
    console.error(
      `   ${offense.file}:${offense.line} — ${offense.kind === "force" ? "force: true" : "waitForTimeout"}`,
    );
  }
  console.error(
    "\n   Use a condition wait/helper, or document the reviewed exception with `force-allow: <reason>` / `wait-allow: <reason>`.",
  );
  process.exitCode = 1;
}

if (import.meta.main) main();
