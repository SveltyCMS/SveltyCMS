/**
 * @file scripts/lint/lint-transient-classification.ts
 * @description Flags a delete of a collection/config file inside a catch
 * handler unless the error is classified first.
 *
 * The regression class: an E2E setup purge deleted live
 * `config/collections/pages.ts`, and the compiled-schema scanner deleted a valid
 * `pages.js` because a Vite teardown was treated as a broken file. Both are
 * "a transient failure triggered a destructive recovery". Deletions of temp,
 * staging or backup files are legitimate and out of scope.
 *
 * Rule: inside a `catch`/`.catch()` handler, `unlink`/`rm` (and sync variants)
 * whose argument mentions a collection/compiled/config/private/preset path must
 * either check `ENOENT`, route through `isTransientSchemaLoadError`, `rethrow`,
 * `throw`, or carry `lint-transient: allow`.
 *
 * Usage:
 *   bun run scripts/lint/lint-transient-classification.ts [--quiet]
 * Exit code: 0 on clean, 1 on any violation.
 *
 * Features:
 * - AST-based catch / `.catch()` handler detection
 * - Svelte `<script>` block extraction with line remapping
 * - Narrow path heuristic keeps temp-file cleanup out of the gate
 */

import ts from "typescript";
import { readSourceFiles, scriptBlocks } from "./lib/source-files";
import type { SourceFile } from "./lib/source-files";

export interface TransientOffense {
  file: string;
  line: number;
  call: string;
}

const DELETE_CALLS = new Set(["unlink", "unlinkSync", "rm", "rmSync", "remove"]);
const USER_DATA_PATH = /(collection|compiled|config|private|preset)/i;
const CLASSIFIED = /\b(?:ENOENT|isTransient|rethrow|throw)\b/;

function isAllowed(lines: string[], index: number): boolean {
  return (
    lines[index]?.includes("lint-transient: allow") ||
    lines[index - 1]?.includes("lint-transient: allow")
  );
}

function collectDeletes(
  root: ts.Node,
  source: ts.SourceFile,
  lines: string[],
  lineOffset: number,
  filePath: string,
  offenses: TransientOffense[],
): void {
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      DELETE_CALLS.has(node.expression.text)
    ) {
      const target = node.arguments[0]?.getText(source) ?? "";
      if (USER_DATA_PATH.test(target)) {
        const localLine = source.getLineAndCharacterOfPosition(node.getStart(source)).line;
        const lineIndex = lineOffset + localLine;
        if (!isAllowed(lines, lineIndex)) {
          offenses.push({
            file: filePath,
            line: lineIndex + 1,
            call: node.expression.text,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
}

/**
 * Pure core — fixtures in `tests/unit/scripts/lint-transient-classification.test.ts`.
 */
export function findUnclassifiedDeletes(files: SourceFile[]): TransientOffense[] {
  const offenses: TransientOffense[] = [];

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
        // try { … } catch (err) { … }
        if (ts.isTryStatement(node) && node.catchClause) {
          const handler = node.catchClause;
          if (!CLASSIFIED.test(handler.getText(source))) {
            collectDeletes(handler.block, source, lines, block.lineOffset, file.path, offenses);
          }
        }

        // promise.catch((err) => { … })
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "catch"
        ) {
          const handler = node.arguments[0];
          if (handler && !CLASSIFIED.test(handler.getText(source))) {
            collectDeletes(handler, source, lines, block.lineOffset, file.path, offenses);
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
  const offenses = findUnclassifiedDeletes(files);

  if (offenses.length === 0) {
    if (!quiet) {
      console.log(
        `✅ transient classification: no unclassified config/collection deletes (${files.length} files).`,
      );
    }
    return;
  }

  console.error(`❌ unclassified destructive recovery: ${offenses.length}`);
  for (const offense of offenses) {
    console.error(
      `   ${offense.file}:${offense.line} — ${offense.call}(…) deletes a config/collection path inside a catch handler.`,
    );
  }
  console.error(
    "\n   Classify the error first (ENOENT / transient platform error) or add a reviewed `lint-transient: allow` comment.",
  );
  process.exitCode = 1;
}

if (import.meta.main) main();
