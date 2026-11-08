/**
 * @file scripts/lint/lint-date-helpers.ts
 * @description Keeps `nowISODateString()` as the only ISO-now source.
 *
 * `new Date().toISOString()` bypasses the shared helper (and its per-tick
 * cache), and the documented rule is "never call it directly". The 2026-11-06
 * audit found 72 call sites outside the helpers; this gate keeps the migration
 * from drifting back. `src/utils/date.ts` implements the helper and
 * `logger.server.ts` slices timestamps for log file names — the only allowed
 * readers.
 *
 * Suppress one line with `lint-date-helpers: allow` when a genuine exception is
 * reviewed.
 *
 * Usage:
 *   bun run scripts/lint/lint-date-helpers.ts [--quiet]
 * Exit code: 0 on clean, 1 on any violation.
 */

import { readSourceFiles } from "./lib/source-files";
import type { SourceFile } from "./lib/source-files";

export interface DateCallOffense {
  file: string;
  line: number;
}

/** The helper implementation and log-file timestamp slicing. */
export const ALLOWED_FILES: ReadonlySet<string> = new Set([
  "src/utils/date.ts",
  "src/utils/logger.server.ts",
]);

const DIRECT_ISO_NOW = /new Date\(\)\.toISOString\(\)/;

function isComment(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

/**
 * Pure core — fixtures in `tests/unit/scripts/lint-date-helpers.test.ts`.
 */
export function findDirectIsoNow(files: SourceFile[]): DateCallOffense[] {
  const offenses: DateCallOffense[] = [];

  for (const file of files) {
    if (ALLOWED_FILES.has(file.path)) continue;
    const lines = file.source.split(/\r?\n/);

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (isComment(line)) continue;
      if (line.includes("lint-date-helpers: allow")) continue;
      if (lines[index - 1]?.includes("lint-date-helpers: allow")) continue;
      if (DIRECT_ISO_NOW.test(line)) {
        offenses.push({ file: file.path, line: index + 1 });
      }
    }
  }

  return offenses;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main(): void {
  const quiet = process.argv.includes("--quiet") || process.argv.includes("--ci");
  const files = readSourceFiles();
  const offenses = findDirectIsoNow(files);

  if (offenses.length === 0) {
    if (!quiet) {
      console.log(`✅ ISO-now calls: all use nowISODateString() (${files.length} files).`);
    }
    return;
  }

  console.error(`❌ direct new Date().toISOString(): ${offenses.length}`);
  for (const offense of offenses) {
    console.error(`   ${offense.file}:${offense.line}`);
  }
  console.error(
    "\n   Import nowISODateString() from `@utils/date`, or add a reviewed `lint-date-helpers: allow` comment.",
  );
  process.exitCode = 1;
}

if (import.meta.main) main();
