/**
 * @file scripts/lint/lint-global-timers.ts
 * @description Flags module-scope timers that are not HMR-safe.
 *
 * Vite re-evaluates server modules on hot reload. A `setInterval` created at
 * module scope therefore installs a **new** timer on every reload, and the old
 * one keeps running forever — it held the previous module's closure alive. Two
 * real incidents: 15 leaked job-queue pollers produced ~640 duplicate
 * `publish-scheduled` rows in 42 minutes, and the content-export handler
 * installed a 5-minute sweep per reload.
 *
 * Rule: a timer at module scope (including a top-level `if`) must be
 * 1. behind a `globalThis` guard — either a property of a global state object
 *    (`state.timer = setInterval(...)`) or inside `if (globalThis…)`, and
 * 2. `.unref()`'d within the next 40 lines (never keep the process alive).
 *
 * Timers inside functions (`onMount`, `start()`, handlers) are out of scope —
 * they are the caller's lifecycle responsibility. The scope check uses the
 * TypeScript AST, so two-space and tab indentation behave the same.
 *
 * Suppress one line with `lint-global-timers: allow` on the timer line or the
 * line above it.
 *
 * Usage:
 *   bun run scripts/lint/lint-global-timers.ts [--quiet]
 * Exit code: 0 on clean, 1 on any violation.
 *
 * Features:
 * - AST scope detection (module vs function/class/module block)
 * - Svelte `<script>` block extraction with line remapping
 * - Per-offense reason (`missing globalThis guard` / `missing unref`)
 */

import ts from "typescript";
import { readSourceFiles, scriptBlocks, type SourceFile } from "./lib/source-files";

export interface TimerOffense {
  file: string;
  line: number;
  reason: "missing globalThis guard" | "missing unref";
  timer: string;
}

const TIMER_NAMES = new Set(["setInterval", "setTimeout"]);
const UNREF_WINDOW_LINES = 40;

/** True when no function/class/module scope sits between the node and the file. */
function isModuleScope(node: ts.Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isSourceFile(current)) return true;
    if (ts.isFunctionLike(current) || ts.isClassLike(current) || ts.isModuleBlock(current)) {
      return false;
    }
  }
  return false;
}

/** A global state property assignment or a top-level `if (globalThis…)` guard. */
function hasGlobalThisGuard(call: ts.CallExpression, source: ts.SourceFile): boolean {
  const parent = call.parent;
  const propertyAssignment =
    (ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(parent.left)) ||
    ts.isPropertyAssignment(parent);

  if (propertyAssignment && source.text.includes("globalThis")) return true;

  for (let current = call.parent; current && !ts.isSourceFile(current); current = current.parent) {
    if (ts.isIfStatement(current) && current.expression.getText(source).includes("globalThis")) {
      return true;
    }
  }
  return false;
}

function isAllowed(lines: string[], index: number): boolean {
  return (
    lines[index]?.includes("lint-global-timers: allow") ||
    lines[index - 1]?.includes("lint-global-timers: allow")
  );
}

/**
 * Pure core — fixtures in `tests/unit/scripts/lint-global-timers.test.ts`.
 */
export function findUnsafeModuleTimers(files: SourceFile[]): TimerOffense[] {
  const offenses: TimerOffense[] = [];

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
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          TIMER_NAMES.has(node.expression.text) &&
          isModuleScope(node)
        ) {
          const localLine = source.getLineAndCharacterOfPosition(node.getStart(source)).line;
          const lineIndex = block.lineOffset + localLine;

          if (!isAllowed(lines, lineIndex)) {
            const timer = node.expression.text;
            const after = lines.slice(lineIndex + 1, lineIndex + UNREF_WINDOW_LINES + 1).join("\n");

            if (!hasGlobalThisGuard(node, source)) {
              offenses.push({
                file: file.path,
                line: lineIndex + 1,
                timer,
                reason: "missing globalThis guard",
              });
            }
            if (!/\.unref\s*\??\.?\s*\(/.test(after)) {
              offenses.push({
                file: file.path,
                line: lineIndex + 1,
                timer,
                reason: "missing unref",
              });
            }
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

  const offenses = findUnsafeModuleTimers(files);

  if (offenses.length === 0) {
    if (!quiet) {
      console.log(`✅ module-scope timers: none unguarded across ${files.length} source files.`);
    }
    return;
  }

  console.error(`❌ module-scope timers: ${offenses.length}`);
  for (const offense of offenses) {
    console.error(`   ${offense.file}:${offense.line} — ${offense.timer} ${offense.reason}.`);
  }
  console.error(
    "\n   Store the timer behind a `globalThis` key and call `.unref()`, or add a `lint-global-timers: allow` comment.",
  );
  process.exitCode = 1;
}

if (import.meta.main) main();
