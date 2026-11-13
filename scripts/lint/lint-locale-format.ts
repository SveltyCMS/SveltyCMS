/**
 * @file scripts/lint/lint-locale-format.ts
 * @description Bans un-pinned `toLocale*String()` formatting outside the formatters.
 *
 * `Date#toLocaleDateString`, `Date#toLocaleTimeString` and the overloaded
 * `toLocaleString` resolve the locale from the runtime (Node ICU, the browser,
 * the OS) instead of `page.data.systemLanguage`. Server render and client
 * hydration can therefore disagree, and the 2026-11-13 UI audit found nine such
 * call sites (one real date, eight number formats) outside the shared helpers.
 *
 * The rule is "format through `@utils/format-date`": `formatDate`,
 * `formatDateTime`, `formatTime` and `formatNumber` already memoize `Intl`
 * instances, resolve the locale deterministically, and fall back safely.
 *
 * `Intl.DateTimeFormat` / `Intl.NumberFormat` are the primitives those helpers
 * use, so constructing them directly is not flagged — only the `toLocale*`
 * shortcuts, which hide the locale resolution.
 *
 * Suppress one line with `lint-locale-format: allow <reason>` when a genuine
 * exception is reviewed.
 *
 * Usage:
 *   bun run scripts/lint/lint-locale-format.ts [--quiet]
 * Exit code: 0 on clean, 1 on any violation.
 */

import { readSourceFiles } from "./lib/source-files";
import type { SourceFile } from "./lib/source-files";

export interface LocaleFormatOffense {
  file: string;
  line: number;
  /** The matched call, e.g. `toLocaleDateString`. */
  call: string;
}

/**
 * The implementation of the formatters. Everything else must route through
 * `formatDate()` / `formatDateTime()` / `formatTime()` / `formatNumber()`.
 */
export const ALLOWED_FILES: ReadonlySet<string> = new Set([
  "src/utils/format-date.ts",
  "src/utils/date.ts",
]);

/** `toLocaleString` is overloaded (Date and Number), so all three short forms are banned. */
const LOCALE_CALL = /\b(toLocaleDateString|toLocaleTimeString|toLocaleString)\s*\(/;

const SUPPRESSION = "lint-locale-format: allow";

function isComment(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

/**
 * Pure core — fixtures in `tests/unit/scripts/lint-locale-format.test.ts`.
 */
export function findLocaleFormatCalls(files: SourceFile[]): LocaleFormatOffense[] {
  const offenses: LocaleFormatOffense[] = [];

  for (const file of files) {
    if (ALLOWED_FILES.has(file.path)) continue;
    const lines = file.source.split(/\r?\n/);

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (isComment(line)) continue;
      if (line.includes(SUPPRESSION)) continue;
      if (lines[index - 1]?.includes(SUPPRESSION)) continue;

      const match = LOCALE_CALL.exec(line);
      if (match) {
        offenses.push({ file: file.path, line: index + 1, call: match[1] });
      }
    }
  }

  return offenses;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main(): void {
  const quiet = process.argv.includes("--quiet") || process.argv.includes("--ci");
  const files = readSourceFiles();
  const offenses = findLocaleFormatCalls(files);

  if (offenses.length === 0) {
    if (!quiet) {
      console.log(`✅ Locale formatting: all use @utils/format-date (${files.length} files).`);
    }
    return;
  }

  console.error(`❌ toLocale*String() outside the formatters: ${offenses.length}`);
  for (const offense of offenses) {
    console.error(`   ${offense.file}:${offense.line} — ${offense.call}()`);
  }
  console.error(
    "\n   Use formatDate()/formatDateTime()/formatTime()/formatNumber() from `@utils/format-date`,\n" +
      "   or add a reviewed `lint-locale-format: allow <reason>` comment.",
  );
  process.exitCode = 1;
}

if (import.meta.main) main();
