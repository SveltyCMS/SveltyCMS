/**
 * @file scripts/lint/lint-click-away.ts
 * @description Every hand-rolled document click-away must actually test containment.
 *
 * The 2026-11-13 UI audit found the dashboard's empty-state button opening its
 * menu and closing it in the same click: the dismiss listener ran on the click
 * that bubbled from the trigger, and its ignore-list named the *toolbar* trigger
 * but not the empty-state one. The failure is always the same shape — a
 * document-level `click` listener whose predicate does not check whether the
 * click happened inside the surface (or on its owner).
 *
 * Nine hand-rolled listeners exist. The shared primitive
 * (`src/components/ui/popover.svelte`) owns the contract for new work; the rest
 * were written before it. This gate does not demand a rewrite — it demands that
 * each listener prove it guards containment with `closest()` or `contains()`,
 * and that a new one is a deliberate, reviewed decision.
 *
 * Escape hatch (one line, reviewed):
 *   // lint-click-away: allow <reason>
 *
 * Usage:
 *   bun run scripts/lint/lint-click-away.ts [--quiet]
 * Exit code: 0 on clean, 1 on any violation.
 */

import { readSourceFiles } from "./lib/source-files";
import type { SourceFile } from "./lib/source-files";

export interface ClickAwayOffense {
  file: string;
  line: number;
  reason: string;
}

/** The shared primitive — it *is* the click-away implementation. */
export const ALLOWED_FILES: ReadonlySet<string> = new Set(["src/components/ui/popover.svelte"]);

const REGISTRATION = /document\s*\.\s*addEventListener\s*\(\s*["']click["']\s*,\s*([^)]*)/g;
const CONTAINMENT = /\b(?:closest|contains)\s*\(/;
/**
 * A deny-list built from `data-testid` values is always one trigger short: the
 * dashboard listed the toolbar button but not the empty-state button, so the
 * empty state opened and closed its menu in one click. Testids are fixtures,
 * not a behavioural contract — the guard must key on semantics
 * (`[aria-haspopup]`, `[role="menu"]`) or on the surface element itself.
 */
const TESTID_GUARD = /closest\(\s*["'`][^"'`]*data-testid/;
const SUPPRESSION = "lint-click-away: allow";

function isComment(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor++) {
    if (source.charCodeAt(cursor) === 10) line++;
  }
  return line;
}

/** Index of the `{` that opens the body of `function NAME(…){…}`. */
function functionBodyStart(source: string, fromParen: number): number {
  let depth = 0;
  for (let cursor = fromParen; cursor < source.length; cursor++) {
    const char = source[cursor];
    if (char === "(") depth++;
    else if (char === ")") {
      depth--;
      if (depth === 0) {
        const brace = source.indexOf("{", cursor);
        return brace;
      }
    }
  }
  return -1;
}

/** The body text of a handler declared in the same file, or `null`. */
export function resolveHandlerBody(source: string, name: string): string | null {
  const declaration = new RegExp(
    `(?:function\\s+${name}\\s*\\()|(?:(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*)`,
  );
  const match = declaration.exec(source);
  if (!match) return null;

  const afterDeclaration = match.index + match[0].length;

  if (match[0].startsWith("function")) {
    const bodyStart = functionBodyStart(source, afterDeclaration - 1);
    return bodyStart === -1 ? null : sliceBlock(source, bodyStart);
  }

  const arrow = source.indexOf("=>", afterDeclaration);
  if (arrow === -1) return null;

  const bodyStart = source.indexOf("{", arrow);
  const statementEnd = source.indexOf(";", arrow);
  if (bodyStart === -1) return null;
  if (statementEnd !== -1 && statementEnd < bodyStart) {
    return source.slice(afterDeclaration, statementEnd);
  }
  return sliceBlock(source, bodyStart);
}

function sliceBlock(source: string, start: number): string | null {
  let depth = 0;
  for (let cursor = start; cursor < source.length; cursor++) {
    const char = source[cursor];
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return source.slice(start, cursor + 1);
    }
  }
  return null;
}

/**
 * Pure core — fixtures in `tests/unit/scripts/lint-click-away.test.ts`.
 */
export function findUnguardedClickAway(files: SourceFile[]): ClickAwayOffense[] {
  const offenses: ClickAwayOffense[] = [];

  for (const file of files) {
    if (ALLOWED_FILES.has(file.path)) continue;
    if (!file.path.endsWith(".svelte")) continue;

    const lines = file.source.split(/\r?\n/);

    for (const match of file.source.matchAll(REGISTRATION)) {
      const line = lineOf(file.source, match.index ?? 0);
      if (lines[line - 1]?.includes(SUPPRESSION)) continue;
      if (lines[line - 2]?.includes(SUPPRESSION)) continue;
      if (isComment(lines[line - 1] ?? "")) continue;

      const handler = (match[1] ?? "").trim();
      const named = /^[A-Za-z_$][\w$]*$/.test(handler);

      if (named) {
        const body = resolveHandlerBody(file.source, handler);
        if (body === null) {
          offenses.push({
            file: file.path,
            line,
            reason: `click-away handler '${handler}' is not declared in this file — its containment guard cannot be verified`,
          });
        } else if (!CONTAINMENT.test(body)) {
          offenses.push({
            file: file.path,
            line,
            reason: `click-away handler '${handler}' never calls closest()/contains(), so the click that opened the surface also dismisses it`,
          });
        } else if (TESTID_GUARD.test(body)) {
          offenses.push({
            file: file.path,
            line,
            reason: `click-away handler '${handler}' guards on a data-testid — a trigger added later is silently unhandled; use [aria-haspopup]/[role="menu"] or the surface element`,
          });
        }
        continue;
      }

      // Inline arrow: inspect the text from the registration to the matching `)`.
      const segment = file.source.slice(match.index ?? 0, (match.index ?? 0) + 600);
      if (!CONTAINMENT.test(segment)) {
        offenses.push({
          file: file.path,
          line,
          reason: "inline click-away handler never calls closest()/contains()",
        });
      }
    }
  }

  return offenses;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main(): void {
  const quiet = process.argv.includes("--quiet") || process.argv.includes("--ci");
  const files = readSourceFiles();
  const offenses = findUnguardedClickAway(files);

  if (offenses.length === 0) {
    if (!quiet) {
      console.log(
        `✅ Click-away listeners: every handler guards containment (${files.length} files).`,
      );
    }
    return;
  }

  console.error(`❌ Unguarded document click-away: ${offenses.length}`);
  for (const offense of offenses) {
    console.error(`   ${offense.file}:${offense.line} — ${offense.reason}`);
  }
  console.error(
    "\n   Prefer the shared <Popover> primitive, or guard the surface with\n" +
      "   `target.closest('[aria-haspopup], [role=\"menu\"]')`. Escape: `// lint-click-away: allow <reason>`.",
  );
  process.exitCode = 1;
}

if (import.meta.main) main();
