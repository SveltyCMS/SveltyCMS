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
 * ### Rule 2 — ungated click on a hydration-gated control
 * Flags a `.click()` on a `getByTestId()` / `getByRole()` locator whose target is
 * one of the controls that ships `disabled` until hydration (`GATED_TESTIDS` /
 * `GATED_LABELS`; the product side binds `disabled={!hydration.hydrated}` from
 * `src/stores/hydration.svelte.ts`). The click is accepted when the same test
 * body already proves interactivity: `waitForHydration()` /
 * `runAfterHydration()` / `selectAndWaitForUrl()` / `fillUntil()`, a
 * `toBeEnabled()` / `toBeDisabled()` assertion, or `// hydration-ok: <reason>`.
 *
 * Locators held in variables are resolved (`const addBtn = page.getByTestId(...)`
 * then `addBtn.click()`), including assignments spanning several lines.
 *
 * Scope is deliberately the gated set, not "every click on every locator": the
 * tree holds 14 legitimate one-shot clicks on controls that never ship disabled
 * (login submit, media view toggles, confirm dialogs), so the broad form would
 * fail on correct code — the same false-positive argument as rule 3. A new
 * hydration-gated flow must be added to `GATED_TESTIDS`.
 *
 * ### Rule 3 — `fill()` followed by a save/dirty assertion: intentionally NOT implemented
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

const CLICK_CALL = /\.click\s*\(/g;
const LOCATOR_CALL = /\.(?:getByTestId|getByRole)\s*\(/;
/** Start of a Playwright test body — the window rule 2 looks for proof in. */
const TEST_START = /^\s*test\s*(?:\.(?:only|skip|fixme|fail))?\s*\(/;

/**
 * Controls whose product code binds `disabled` to `hydration.hydrated`.
 * `"<page>: <testid>"` — the page half is documentation, the id half is matched.
 * Keep in sync when a flow becomes hydration-gated.
 */
const GATED_CONTROLS: readonly string[] = [
  "src/routes/(app)/config/webhooks/+page.svelte: webhooks-add",
  "src/routes/(app)/config/system-settings/+page.svelte: system-settings-check-structure",
  "src/routes/(app)/user/+page.svelte: edit-user-settings-btn",
  "src/routes/(app)/user/+page.svelte: user-account-tabs",
  "src/components/ui/tabs.svelte: tab-identity",
  "src/components/ui/tabs.svelte: tab-security",
  "src/components/ui/tabs.svelte: tab-settings",
  "src/components/ui/tabs.svelte: tab-management",
];

const GATED_TESTIDS = GATED_CONTROLS.map((entry) => entry.slice(entry.indexOf(": ") + 2));

/** `/shop`'s add-to-cart button carries no testid — it is gated by label. */
const GATED_LABELS = [/add to cart/i];

/** Everything that already proves the page (or the control) is interactive. */
const GATE_PROOF =
  /(?:waitForHydration|runAfterHydration|selectAndWaitForUrl|fillUntil)\s*\(|\.(?:toBeEnabled|toBeDisabled)\s*\(|hydration-ok:/;

const FIX_HINT =
  "gate the control (`disabled={!hydration.hydrated}`) and assert its own state " +
  "(`await expect(locator).toBeEnabled()`), route the interaction through " +
  "waitForHydration()/runAfterHydration()/selectAndWaitForUrl()/fillUntil() from " +
  "tests/e2e/helpers/hydration.ts, or annotate `// hydration-ok: <reason>`";

export interface HydrationFinding {
  /** Repo-relative, forward-slash path. */
  file: string;
  /** 1-based line of the offending call. */
  line: number;
  rule: "change-dispatch" | "ungated-click";
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

  findings.push(...findUngatedClicks(text, masked, file));

  return findings;
}

/** Line boundaries of `text` (index of each line's first character). */
function lineStartsOf(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

/** 1-based line number of a character offset. */
function lineOf(starts: number[], index: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * End of the statement that starts at `start`, tolerant of multi-line call
 * chains: a newline only ends the statement when parens are balanced and the
 * next line does not continue with `.`/`?.`.
 */
function statementEnd(masked: string, start: number): number {
  let depth = 0;
  for (let i = start; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      if (depth < 0) return i;
    } else if (ch === ";" && depth === 0) return i;
    else if (ch === "\n" && depth === 0) {
      let j = i + 1;
      while (j < masked.length && (masked[j] === " " || masked[j] === "\t")) j += 1;
      if (masked[j] === "." || (masked[j] === "?" && masked[j + 1] === ".")) continue;
      return i;
    }
  }
  return masked.length;
}

interface LocatorAssignment {
  name: string;
  value: string;
  index: number;
}

/** `const foo = page.getByTestId(...)` (any line span) → foo's locator text. */
function collectLocatorAssignments(text: string, masked: string): LocatorAssignment[] {
  const assignments: LocatorAssignment[] = [];
  const declaration = /(?:^|[;{}\n])\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;

  for (const match of masked.matchAll(declaration)) {
    const name = match[1];
    const valueStart = (match.index ?? 0) + match[0].length;
    const value = text.slice(valueStart, statementEnd(masked, valueStart));
    if (!LOCATOR_CALL.test(value)) continue;
    assignments.push({ name, value, index: valueStart });
  }

  return assignments;
}

/** Extend a click's line backwards over a call chain that continues it. */
function statementStartOf(masked: string, lineStart: number): number {
  let start = lineStart;
  while (start > 0) {
    const previousLineEnd = start - 1;
    if (masked[previousLineEnd] !== "\n") break;
    const previousStart = masked.lastIndexOf("\n", previousLineEnd - 1) + 1;
    const previous = masked.slice(previousStart, previousLineEnd).trimEnd();
    const current = masked.slice(start).trimStart();
    if (current.startsWith(".") || previous.endsWith("(") || previous.endsWith(",")) {
      start = previousStart;
      continue;
    }
    break;
  }
  return start;
}

/** Is this click target one of the disabled-until-hydrated controls? */
function isGatedTarget(target: string): boolean {
  if (GATED_TESTIDS.some((id) => target.includes(`"${id}"`) || target.includes(`'${id}'`))) {
    return true;
  }
  return GATED_LABELS.some((label) => LOCATOR_CALL.test(target) && label.test(target));
}

/**
 * Rule 2: a click on a gated control with nothing in the enclosing test body
 * proving the page is interactive yet.
 */
function findUngatedClicks(text: string, masked: string, file: string): HydrationFinding[] {
  const findings: HydrationFinding[] = [];
  const lines = text.split("\n");
  const starts = lineStartsOf(text);
  const assignments = collectLocatorAssignments(text, masked);

  for (const match of masked.matchAll(CLICK_CALL)) {
    const index = match.index ?? 0;
    const line = lineOf(starts, index);
    const lineStart = starts[line - 1];
    const before = text.slice(statementStartOf(masked, lineStart), index);

    // Resolve `locator.click()` through the variable that holds the locator.
    let target = before;
    if (!LOCATOR_CALL.test(before)) {
      const ident = before.match(/([A-Za-z_$][\w$]*)\s*$/);
      if (!ident) continue;
      const holder = assignments.filter((a) => a.name === ident[1] && a.index < index).at(-1);
      if (!holder) continue;
      target = holder.value;
    }

    if (!isGatedTarget(target)) continue;

    let bodyStart = 0;
    for (let i = line - 2; i >= 0; i -= 1) {
      if (TEST_START.test(lines[i])) {
        bodyStart = i;
        break;
      }
    }
    const body = lines.slice(bodyStart, line).join("\n");
    if (GATE_PROOF.test(body)) continue;

    findings.push({
      file,
      line,
      rule: "ungated-click",
      message:
        "click on a hydration-gated control with no hydration/enabled proof earlier in this " +
        "test body — the control is disabled in the server HTML",
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
    `✅ E2E hydration lint OK — no direct change dispatches and no ungated clicks on ` +
      `${GATED_TESTIDS.length} hydration-gated controls in ${specFiles.length} spec files.`,
  );
}

// Only execute when run directly via CLI (not when imported by a unit test)
if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/lint/lint-e2e-hydration.ts")) {
  run();
}
