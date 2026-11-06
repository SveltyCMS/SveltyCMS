/**
 * @file scripts/lint/lint-silent-catch.ts
 * @description Bans empty `catch {}` blocks. A swallowed error must be either
 * logged (`logger.debug` at minimum) or carry a written justification.
 *
 * Empty catches hide the failure classes this codebase has repeatedly paid for:
 * a transient module-runner teardown looked like corruption, and a failed
 * cleanup looked like success. The codemod that fixed the 2026-11-06 audit's 93
 * sites inserted `logger.debug(..., error)`; comments remain an accepted
 * justification when logging is genuinely impossible (e.g. a logger-free shim).
 *
 * Allowed:
 * - `catch (error) { logger.debug(…, error); }`
 * - `catch { /* intentional: … *\/ }`
 * - `} catch {} // catch-allow: <reason>`
 *
 * Usage:
 *   bun run scripts/lint/lint-silent-catch.ts [--quiet]
 * Exit code: 0 on clean, 1 on any violation.
 */

import ts from "typescript";
import { readSourceFiles, scriptBlocks } from "./lib/source-files";
import type { SourceFile } from "./lib/source-files";

export interface SilentCatchOffense {
  file: string;
  line: number;
}

/** `.catch(() => {})` cleanup handlers are intentionally out of scope. */
function isAllowed(clauseText: string, lines: string[], lineIndex: number): boolean {
  if (clauseText.includes("//") || clauseText.includes("/*")) return true;
  return (
    lines[lineIndex]?.includes("catch-allow:") || lines[lineIndex - 1]?.includes("catch-allow:")
  );
}

/**
 * Pure core — fixtures in `tests/unit/scripts/lint-silent-catch.test.ts`.
 */
export function findSilentCatches(files: SourceFile[]): SilentCatchOffense[] {
  const offenses: SilentCatchOffense[] = [];

  for (const file of files) {
    const lines = file.source.split(/\r?\n/);

    for (const block of scriptBlocks(file)) {
      const source = ts.createSourceFile(
        file.path,
        block.text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      const visit = (node: ts.Node): void => {
        if (
          ts.isTryStatement(node) &&
          node.catchClause &&
          node.catchClause.block.statements.length === 0
        ) {
          const clauseText = node.catchClause.getText(source);
          const localLine = source.getLineAndCharacterOfPosition(
            node.catchClause.getStart(source),
          ).line;
          const lineIndex = block.lineOffset + localLine;
          if (!isAllowed(clauseText, lines, lineIndex)) {
            offenses.push({ file: file.path, line: lineIndex + 1 });
          }
        }
        ts.forEachChild(node, visit);
      };

      visit(source);
    }
  }

  return offenses;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main(): void {
  const quiet = process.argv.includes("--quiet") || process.argv.includes("--ci");
  const files = readSourceFiles();
  const offenses = findSilentCatches(files);

  if (offenses.length === 0) {
    if (!quiet) {
      console.log(`✅ silent catches: none (${files.length} files).`);
    }
    return;
  }

  console.error(`❌ empty catch blocks: ${offenses.length}`);
  for (const offense of offenses) {
    console.error(`   ${offense.file}:${offense.line}`);
  }
  console.error(
    "\n   Log the error (`logger.debug(…, error)`) or add a written `catch-allow: <reason>`.",
  );
  process.exitCode = 1;
}

if (import.meta.main) main();
