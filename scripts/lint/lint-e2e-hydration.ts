#!/usr/bin/env bun
/**
 * @file scripts/lint/lint-e2e-hydration.ts
 * @description Guard against E2E interactions issued before Svelte hydration.
 *
 * SvelteKit paints SSR HTML before Svelte attaches listeners, so an event fired
 * in that window is a silent no-op — it produced three flakes in one day (a
 * `select` change that never navigated, a `fill` that never set the dirty flag,
 * an awaited upload response instead of the rendered card). The retried-pass
 * workarounds that repaired them belong in `tests/e2e/helpers/hydration.ts`,
 * not copy-pasted into each spec.
 *
 * ### Rule 1 — direct change dispatch in a spec
 * Flags every `.dispatchEvent("change")` inside the `tests/e2e` spec files,
 * including the `evaluate((el) => el.dispatchEvent("change"))` variant.
 * `selectOption()` and `fill()` already dispatch their own events, so a manual
 * change dispatch in a spec is either repairing a hydration race (route it
 * through `selectAndWaitForUrl()` / `fillUntil()`) or hiding one.
 *
 * Out of scope by design: `dispatchEvent(new Event("change"))` (the literal is
 * nested one level deeper and is usually a deliberate DOM-level probe) and the
 * pointer/drag dispatches in `collection-builder/builder.spec.ts`, which are
 * pointer primitives with no hydration-safe helper equivalent.
 *
 * ### Rule 2 — `fill()` followed by a save/dirty assertion: intentionally NOT implemented
 * "Within 3 lines of a `.fill(`" cannot distinguish `input.fill(x)` from
 * `saveBtn.click()` or an unrelated search assertion. The tree already has
 * legitimate neighbours (`collection-builder/builder.spec.ts` fills a name and
 * resolves a save button three lines later without any dirty-flag intent), so
 * the rule would fire on correct code and train people to annotate everything.
 * A false positive here is worse than the missing coverage: the hydration
 * helpers carry that intent explicitly (`fillUntil(locator, value, assertion)`).
 *
 * ### Exemption
 * `// hydration-ok: <reason>` on the same or the previous line. The reason is
 * mandatory: `hydration-ok:` with nothing after it still reports.
 *
 * ### Scope
 * Specs only (files ending in `.spec.ts` under `tests/e2e`). Helpers, fixtures
 * and page objects are not scanned; `tests/e2e/helpers/hydration.ts` is exempt
 * by path as well.
 *
 * Usage:
 *   bun run scripts/lint/lint-e2e-hydration.ts            # report, exit 0
 *   bun run scripts/lint/lint-e2e-hydration.ts --check    # exit 1 on findings
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const E2E_DIR = join(ROOT, "tests", "e2e");
const HYDRATION_HELPER = "tests/e2e/helpers/hydration.ts";

const DISPATCH_CALL = /\.dispatchEvent\s*\(/g;
/** Argument text immediately after `.dispatchEvent(` — only a bare literal counts. */
const CHANGE_ARG = /^\s*(["'`])change\1(?![A-Za-z0-9_$])/;
const HYDRATION_OK = /hydration-ok:\s*\S/;

const FIX_HINT =
  "route it through selectAndWaitForUrl()/fillUntil()/runAfterHydration() from " +
  "tests/e2e/helpers/hydration.ts, or annotate `// hydration-ok: <reason>`";

export interface HydrationFinding {
  /** Repo-relative, forward-slash path. */
  file: string;
  /** 1-based line of the offending call. */
  line: number;
  rule: "change-dispatch";
  message: string;
}

/**
 * Blank out comment bodies and string/template contents while preserving every
 * offset and newline, so reported lines line up with the file.
 *
 * Detection runs on the masked text (a `.dispatchEvent(` that merely appears
 * inside a string is not a call), while the argument is read back from the raw
 * text (the `"change"` literal is a string, so it is blanked here).
 *
 * A `//` inside a string is never treated as a comment because the scanner
 * consumes strings first.
 */
export function maskCode(text: string): string {
  const out = text.split("");
  const n = out.length;
  let i = 0;

  while (i < n) {
    if (out[i] === "/" && out[i + 1] === "/") {
      while (i < n && out[i] !== "\n") {
        out[i] = " ";
        i += 1;
      }
      continue;
    }

    if (out[i] === "/" && out[i + 1] === "*") {
      out[i] = " ";
      out[i + 1] = " ";
      i += 2;
      while (i < n && !(out[i] === "*" && out[i + 1] === "/")) {
        if (out[i] !== "\n") out[i] = " ";
        i += 1;
      }
      if (i < n) {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
      }
      continue;
    }

    if (out[i] === '"' || out[i] === "'" || out[i] === "`") {
      const quote = out[i];
      i += 1;
      while (i < n) {
        if (out[i] === "\\") {
          out[i] = " ";
          if (i + 1 < n && out[i + 1] !== "\n") out[i + 1] = " ";
          i += 2;
          continue;
        }
        if (out[i] === quote) {
          i += 1;
          break;
        }
        if (out[i] === "\n" && quote !== "`") break;
        if (out[i] !== "\n") out[i] = " ";
        i += 1;
      }
      continue;
    }

    i += 1;
  }

  return out.join("");
}

/**
 * Pure function: audit one file's source for hydration-race anti-patterns.
 * Exported so a unit test can exercise the rules without touching disk.
 */
export function findHydrationViolations(text: string, file = "<snippet>"): HydrationFinding[] {
  const findings: HydrationFinding[] = [];
  const masked = maskCode(text);
  const lines = text.split("\n");

  let line = 1;
  let scanned = 0;

  for (const match of masked.matchAll(DISPATCH_CALL)) {
    const index = match.index ?? 0;
    for (let k = scanned; k < index; k += 1) {
      if (masked[k] === "\n") line += 1;
    }
    scanned = index;

    // The argument lives in the raw text: masking blanks the string literal.
    const argument = text.slice(index + match[0].length);
    if (!CHANGE_ARG.test(argument)) continue;

    const current = lines[line - 1] ?? "";
    const previous = lines[line - 2] ?? "";
    if (HYDRATION_OK.test(current) || HYDRATION_OK.test(previous)) continue;

    findings.push({
      file,
      line,
      rule: "change-dispatch",
      message:
        "direct change dispatch in a spec — the handler may not be attached yet (hydration race)",
    });
  }

  return findings;
}

function collectSpecFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      files.push(...collectSpecFiles(full));
      continue;
    }
    if (!entry.name.endsWith(".spec.ts")) continue;
    if (!statSync(full).isFile()) continue;
    files.push(full);
  }

  return files;
}

function toRepoPath(full: string): string {
  return relative(ROOT, full).replaceAll("\\", "/");
}

function run(): void {
  const check = process.argv.includes("--check");
  const specFiles = collectSpecFiles(E2E_DIR).map(toRepoPath);

  const findings: HydrationFinding[] = [];
  for (const file of specFiles) {
    if (file === HYDRATION_HELPER) continue;
    const text = readFileSync(join(ROOT, file), "utf8");
    findings.push(...findHydrationViolations(text, file));
  }

  if (findings.length > 0) {
    const writer = check ? console.error : console.warn;
    writer(`\n⚠️  E2E hydration findings (${findings.length}):\n`);
    for (const finding of findings) {
      writer(`  ${finding.file}:${finding.line}  ${finding.message}`);
      writer(`      fix: ${FIX_HINT}`);
    }
    writer("");

    if (check) {
      console.error(
        `❌ E2E hydration guard failed — ${findings.length} violation(s) in ${specFiles.length} spec files.`,
      );
      process.exit(1);
    }

    console.log(
      `ℹ️  Advisory run — ${findings.length} finding(s). Re-run with --check to fail the gate.`,
    );
    return;
  }

  console.log(
    `✅ E2E hydration lint OK — no direct change dispatches in ${specFiles.length} spec files.`,
  );
}

// Only execute when run directly via CLI (not when imported by a unit test)
if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/lint/lint-e2e-hydration.ts")) {
  run();
}
