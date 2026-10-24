#!/usr/bin/env bun
/**
 * @file scripts/lint/lint-trivially-true-assertions.ts
 * @description Guard against assertions that cannot fail.
 *
 * The media-gallery loader bug (F01) stayed green for a whole release because
 * its test read `expect(Array.isArray(media) || media === undefined || true)
 * .toBe(true)`: the loader discarded the adapter's `total`, and the assertion
 * was satisfied by the literal `true` regardless. The same class of weak
 * assertion kept appearing as "any of these three things happened" unions and
 * as `try { expect(…) } catch { … }` blocks, where a thrown assertion was
 * caught and logged instead of failing the test.
 *
 * ### Rule 1 — `literal-tautology`
 * A truthiness matcher (`toBe(true)`, `toEqual(true)`, `toStrictEqual(true)`,
 * `toBeTruthy()`, `not.toBeFalsy()`, and the falsy mirror images) whose
 * received expression is, or contains as a top-level `||` arm, a literal with
 * a fixed truthiness (`true`, `!0`, a non-zero number, a non-empty string,
 * `[]`, `{}`) — or, for `.toBe(false)`-style matchers, a top-level `&&` arm
 * that is a fixed falsy literal. The assertion is then satisfiable without
 * observing the value under test. Provably unfailable.
 *
 * ### Rule 2 — `complementary-arms`
 * A top-level `||` chain containing two arms that are exact complements after
 * whitespace normalisation: `P` / `!P`, or `x === c` / `x !== c`. One arm is
 * always true, so the disjunction is provably tautological.
 *
 * ### Rule 3 — `any-of-assertion`
 * A truthiness assertion whose received expression is a top-level `||` chain
 * of two or more **boolean predicates**: comparisons (`===`, `!==`, `==`,
 * `!=`), `typeof` / `Array.isArray()` / `Number.isFinite()` / `instanceof`,
 * a `!`-prefixed expression, an `includes`/`startsWith`/`endsWith`/`test`/
 * `some`/`every`/`has` call, or a local const/let bound to a Playwright
 * `isVisible()/isEnabled()/isAttached()/isHidden()/isDisabled()/isChecked()/
 * isEditable()` probe. This is the "accepted outcomes" union (an empty state
 * *or* a grid; a `{success}` envelope *or* a bare array). It cannot tell which
 * outcome occurred, so a regression that flips one arm to another arm keeps it
 * green — the F01 shape minus the literal `true`. Write the outcome down
 * instead: a testid locator union (`empty.or(grid).first()`) with a real
 * matcher, an exact status, a count, or a re-read.
 *
 * A value fallback such as `expect(user.name || user.email).toBeTruthy()` is
 * intentionally **not** flagged: both arms are values, so the assertion still
 * fails when both are empty. The rule is about unions of *observations*, not
 * unions of *values*.
 *
 * ### Rule 4 — `swallowed-assertion`
 * `expect(…)` inside a `try` block that **performs the interaction under test**
 * (a click / fill / upload / POST) and whose `catch` neither rethrows, fails
 * (`expect.fail`), nor asserts an alternative outcome. The assertion can never
 * fail the test: the interaction appears green even when the outcome is wrong.
 * Guard the *operation* instead, then assert outside the guard, or use
 * `expect.soft(…)` (Playwright records soft failures separately, so a catch
 * cannot swallow them).
 *
 * A `try` that only observes (`waitForURL` + `expect`, a read) is
 * intentionally **not** flagged: there the assertion is a polling primitive and
 * the catch selects the other branch of a conditional — moving it out would
 * change control flow, not strengthen the test.
 *
 * ### Intentionally not flagged
 * - `.rejects` / `.resolves` / `toThrow` matchers and `expect.soft(…)` (not
 *   `expect(`, and soft failures are recorded).
 * - `toContain` with an array of accepted values (`expect([200, 503])`) — the
 *   sanctioned multi-status form; it still fails on an unlisted status.
 * - `||` inside a call/parenthesised argument (`list.some((x) => x.a || x.b)`)
 *   — only the top level of the received expression is split.
 * - Same-subject shape unions (`typeof x === "number" || x === undefined`, the
 *   optional-field contract). They still fail when the value has another type,
 *   so they are not unfailable; Rule 3 only fires when the arms observe
 *   **different** subjects.
 * - Fixtures: strings and comments are masked before scanning, so a lint test
 *   that quotes a bad assertion is not itself flagged.
 *
 * ### Exemption
 * `// trivial-assert-ok: <reason>` on the same or the previous line, for every
 * rule. The reason is mandatory (a bare marker still reports). It exists for
 * genuine contract unions (a cursor that may be sync or async iterable) and
 * for helper probes whose boolean return value is the product of the check.
 *
 * Usage:
 *   bun run scripts/lint/lint-trivially-true-assertions.ts           # report, exit 0
 *   bun run scripts/lint/lint-trivially-true-assertions.ts --check   # exit 1 on findings
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { maskCode } from "./lint-e2e-hydration.ts";

const ROOT = join(import.meta.dirname, "../..");
const TESTS_DIR = join(ROOT, "tests");

const EXEMPT = /trivial-assert-ok:\s*\S/;
const EXPECT_CALL = /\bexpect\s*\(/g;
const TRY_BLOCK = /\btry\s*\{/g;

/** Matcher head immediately after the `expect(…)` argument list. */
const MATCHER =
  /^\s*\.\s*(not\s*\.\s*)?(toBe|toEqual|toStrictEqual|toBeTruthy|toBeFalsy)\s*\(\s*(true|false)?\s*,?\s*\)/;

/** Calls that mutate the system under test (the interaction, not the observation). */
const MUTATION_CALL =
  /\.(?:click|fill|setInputFiles|press|check|uncheck|selectOption|dispatchEvent|type|upload|dragTo|hover)\s*\(|\b(?:fetch|safeFetch)\s*\([^)]*(?:POST|PUT|PATCH|DELETE)|\brequest\s*\.\s*(?:post|put|patch|delete)\s*\(/;

/** Playwright probe calls that return a boolean. */
const VISIBILITY_PROBE =
  /\.(?:isVisible|isEnabled|isAttached|isHidden|isDisabled|isChecked|isEditable)\s*\(/;

/** Calls whose return value is already a boolean observation. */
const PREDICATE_CALL =
  /\.(?:some|every|includes|startsWith|endsWith|test|has|isVisible|isEnabled|isAttached|isHidden|isDisabled|isChecked|isEditable)\s*\(/;

export type TrivialRule =
  | "literal-tautology"
  | "complementary-arms"
  | "any-of-assertion"
  | "swallowed-assertion";

const FIX_HINTS: Record<TrivialRule, string> = {
  "literal-tautology":
    "remove the literal arm and assert the value itself (a field, a count, a status)",
  "complementary-arms":
    "delete the self-cancelling disjunction and assert the one outcome that matters",
  "any-of-assertion":
    "assert the specific outcome (exact status/count/testid) — or annotate `// trivial-assert-ok: <reason>` when a union is the contract",
  "swallowed-assertion":
    "move the assertion out of the try (guard only the operation), rethrow in catch, or use expect.soft()",
};

export interface TrivialFinding {
  /** Repo-relative, forward-slash path. */
  file: string;
  /** 1-based line of the `expect(` token. */
  line: number;
  /** Byte offset of the `expect(` token (stable sort / de-dupe key). */
  index: number;
  rule: TrivialRule;
  /** Shortened assertion text for the report. */
  assertion: string;
  message: string;
}

type MatcherKind = "positive" | "negative" | null;

/** Line-start offsets, so a finding can be mapped to a line in O(log n). */
function buildLineIndex(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function lineOf(starts: number[], index: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= index) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}

/** Raw text of a 1-based line (without its trailing newline). */
function lineText(text: string, starts: number[], line: number): string {
  const start = starts[line - 1] ?? 0;
  const end = line < starts.length ? starts[line] - 1 : text.length;
  return text.slice(start, end);
}

/** Index of the `)` matching the `(` at `openIndex` (on masked text), or -1. */
function matchingParen(masked: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Index of the `}` matching the `{` at `openIndex` (on masked text), or -1. */
function matchingBrace(masked: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Split an expression on a top-level operator. Parenthesised/call arguments are
 * left intact, so a `||` inside `list.some((x) => x.a || x.b)` is never treated
 * as part of the received expression's own union.
 */
export function splitTopLevel(expr: string, operator: "||" | "&&"): string[] {
  const masked = maskCode(expr);
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    else if (
      depth === 0 &&
      ch === operator[0] &&
      masked[i + 1] === operator[1] &&
      masked[i + 2] !== "="
    ) {
      parts.push(expr.slice(start, i).trim());
      i += 1;
      start = i + 1;
    }
  }

  parts.push(expr.slice(start).trim());
  return parts;
}

function stripOuterParens(input: string): string {
  let text = input.trim();
  while (text.startsWith("(") && text.endsWith(")")) {
    const close = matchingParen(maskCode(text), 0);
    if (close !== text.length - 1) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

/** True when the expression has a top-level `==`/`!=`/`===`/`!==` comparison. */
export function hasTopLevelEquality(input: string): boolean {
  const masked = maskCode(input);
  let depth = 0;

  for (let i = 0; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    else if (depth === 0) {
      const pair = masked.slice(i, i + 2);
      if (pair === "==" || pair === "!=") {
        const previous = masked[i - 1] ?? "";
        if (previous !== "=" && previous !== "!" && previous !== "<" && previous !== ">")
          return true;
      }
    }
  }

  return false;
}

/** Fixed truthiness of a literal arm, or `null` when the arm is not a literal. */
export function literalTruthiness(input: string): boolean | null {
  const text = stripOuterParens(input);
  if (text === "true" || text === "!0") return true;
  if (text === "false" || text === "!1" || text === "null" || text === "undefined") return false;
  if (text === "NaN") return false;
  if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return Number(text) !== 0;
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' || first === "'") && last === first) return text.length > 2;
    if (first === "`" && last === "`") return text.length > 2;
  }
  if (text === "[]" || text === "{}") return true;
  return null;
}

function normalise(input: string): string {
  return stripOuterParens(input).replace(/\s+/g, "");
}

/** True when two arms are exact complements (`P` / `!P`, `x === c` / `x !== c`). */
export function isComplementaryPair(a: string, b: string): boolean {
  const left = stripOuterParens(a);
  const right = stripOuterParens(b);

  if (normalise(right) === `!${normalise(left)}`) return true;
  if (normalise(left) === `!${normalise(right)}`) return true;

  const parseEquality = (text: string) => {
    const match = /^(.*?)(===|!==|==|!=)(.*)$/.exec(text);
    if (!match) return null;
    return { left: normalise(match[1]), op: match[2], right: normalise(match[3]) };
  };

  const eqA = parseEquality(left);
  const eqB = parseEquality(right);
  if (!eqA || !eqB) return false;
  if (eqA.left !== eqB.left || eqA.right !== eqB.right) return false;

  const mirrored: Record<string, string> = { "===": "!==", "!==": "===", "==": "!=", "!=": "==" };
  return mirrored[eqA.op] === eqB.op;
}

/** Local `const`/`let` names bound to a Playwright visibility/enabled probe. */
export function collectBooleanProbes(masked: string): Set<string> {
  const probes = new Set<string>();

  for (const match of masked.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g)) {
    const start = (match.index ?? 0) + match[0].length;
    let depth = 0;
    let end = Math.min(start + 600, masked.length);

    for (let i = start; i < start + 600 && i < masked.length; i += 1) {
      const ch = masked[i];
      if (ch === "(" || ch === "[" || ch === "{") depth += 1;
      else if (ch === ")" || ch === "]" || ch === "}") {
        if (depth === 0) {
          end = i;
          break;
        }
        depth -= 1;
      } else if (ch === ";" && depth === 0) {
        end = i;
        break;
      }
    }

    const initializer = masked.slice(start, end);
    if (VISIBILITY_PROBE.test(initializer) || /\bBoolean\s*\(|!!/.test(initializer)) {
      probes.add(match[1]);
    }
  }

  return probes;
}

/** True when an arm is a boolean observation rather than a value. */
export function isPredicateArm(input: string, probes: Set<string>): boolean {
  const text = stripOuterParens(input);
  if (!text) return false;
  if (probes.has(text)) return true;
  if (text.startsWith("!")) return true;
  if (/^(?:typeof\s|Array\.isArray\s*\(|Number\.isFinite\s*\(|Boolean\s*\()/.test(text)) {
    return true;
  }
  if (/\binstanceof\b/.test(text)) return true;
  if (PREDICATE_CALL.test(text)) return true;
  return hasTopLevelEquality(text);
}

function withoutValueWrappers(input: string): string {
  let text = stripOuterParens(input);
  const wrapped = /^(?:Number|String|Boolean)\s*\(\s*([\s\S]+?)\s*\)$/.exec(text);
  if (wrapped) text = stripOuterParens(wrapped[1]);
  return text;
}

/**
 * Best-effort subject of a predicate arm: the value the arm observes.
 * `typeof x === "number"` and `x === 1` both observe `x`, so a union over the
 * same subject is an optional-field shape, not a union of outcomes.
 */
export function armSubject(input: string): string | null {
  const text = stripOuterParens(input);
  if (!text) return null;

  const typeofMatch = /^typeof\s+([\s\S]+?)\s*(?:===|!==|==|!=)/.exec(text);
  if (typeofMatch) return normalise(typeofMatch[1]);

  const equalityMatch = /^([\s\S]+?)\s*(?:===|!==|==|!=)/.exec(text);
  if (equalityMatch) return normalise(withoutValueWrappers(equalityMatch[1]));

  const negationMatch = /^!\s*([\s\S]+)$/.exec(text);
  if (negationMatch) return normalise(withoutValueWrappers(negationMatch[1]));

  const callMatch =
    /^\(?([\s\S]*?)\)?\.\s*(?:some|every|includes|startsWith|endsWith|test|has|isVisible|isEnabled|isAttached|isHidden|isDisabled|isChecked|isEditable)\s*\(/.exec(
      text,
    );
  if (callMatch) return normalise(callMatch[1]);

  const guardMatch = /^(?:Array\.isArray|Number\.isFinite|Boolean)\s*\(\s*([\s\S]+?)\s*\)\s*$/.exec(
    text,
  );
  if (guardMatch) return normalise(stripOuterParens(guardMatch[1]));

  return normalise(text);
}

function matcherKind(masked: string, closeIndex: number): MatcherKind {
  // Read a small masked window: comments are blanked, so no false matcher.
  const tail = masked.slice(closeIndex + 1, closeIndex + 200);
  const match = MATCHER.exec(tail);
  if (!match) return null;

  const negated = Boolean(match[1]);
  const name = match[2];
  const literal = match[3];

  if (name === "toBeTruthy") return negated ? "negative" : "positive";
  if (name === "toBeFalsy") return negated ? "positive" : "negative";
  if (literal === "true") return negated ? "negative" : "positive";
  if (literal === "false") return negated ? "positive" : "negative";
  return null;
}

function snippet(text: string, start: number, end: number): string {
  const flat = text.slice(start, end).replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat;
}

interface TryBlock {
  /** Offsets of the `{` … `}` holding the try body. */
  start: number;
  end: number;
  /** The swallowed assertion is only reported when the try also mutates. */
  mutates: boolean;
  /** Offset range of the catch body. */
  catchStart: number;
  catchEnd: number;
}

/** Every `try {} catch {}` whose handler swallows rather than re-asserts. */
function tryBlocks(masked: string): TryBlock[] {
  const blocks: TryBlock[] = [];

  for (const match of masked.matchAll(TRY_BLOCK)) {
    const openBrace = (match.index ?? 0) + match[0].length - 1;
    const closeBrace = matchingBrace(masked, openBrace);
    if (closeBrace === -1) continue;

    const catchMatch = /^\s*catch\s*(?:\([^)]*\))?\s*\{/.exec(masked.slice(closeBrace + 1));
    if (!catchMatch) continue;

    const catchOpen = closeBrace + 1 + catchMatch[0].length - 1;
    const catchClose = matchingBrace(masked, catchOpen);
    if (catchClose === -1) continue;

    const catchBody = masked.slice(catchOpen + 1, catchClose);
    // `throw`, `expect.fail(...)` and an alternative `expect(...)` in the handler
    // all keep a failure visible to the runner.
    if (
      /\bthrow\b/.test(catchBody) ||
      /\bexpect\s*\.\s*fail\s*\(/.test(catchBody) ||
      /\bexpect\s*\(/.test(catchBody)
    ) {
      continue;
    }

    blocks.push({
      start: openBrace,
      end: closeBrace,
      mutates: MUTATION_CALL.test(masked.slice(openBrace + 1, closeBrace)),
      catchStart: catchOpen,
      catchEnd: catchClose,
    });
  }

  return blocks;
}

/**
 * Pure function: audit one file's source for assertions that cannot fail.
 * Exported so a unit test can exercise the rules without touching disk.
 */
export function findTrivialAssertions(text: string, file = "<snippet>"): TrivialFinding[] {
  const findings: TrivialFinding[] = [];
  const masked = maskCode(text);
  const lines = buildLineIndex(text);
  const swallowedRanges = tryBlocks(masked);
  const probes = collectBooleanProbes(masked);
  const seen = new Set<string>();

  const push = (index: number, rule: TrivialRule, end: number, message: string) => {
    const key = `${rule}:${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({
      file,
      line: lineOf(lines, index),
      index,
      rule,
      assertion: snippet(text, index, end),
      message,
    });
  };

  for (const match of masked.matchAll(EXPECT_CALL)) {
    const index = match.index ?? 0;
    const openParen = index + match[0].length - 1;
    const closeParen = matchingParen(masked, openParen);
    if (closeParen === -1) continue;

    const received = text.slice(openParen + 1, closeParen);
    const arms = splitTopLevel(received, "||");
    const kind = matcherKind(masked, closeParen);
    const line = lineOf(lines, index);
    const exempt =
      EXEMPT.test(lineText(text, lines, line)) ||
      (line > 1 && EXEMPT.test(lineText(text, lines, line - 1)));

    // Rule 4 — a swallowed assertion never reaches the runner.
    const insideSwallowingTry = swallowedRanges.some(
      (block) => block.mutates && index > block.start && index < block.end,
    );
    if (insideSwallowingTry && !exempt) {
      push(
        index,
        "swallowed-assertion",
        closeParen + 1,
        "assertion sits in a try{} whose catch neither rethrows nor fails — a failure is logged away",
      );
    }

    if (!kind || exempt) continue;

    // Rule 1 — a literal arm with a fixed truthiness makes the assertion fixed.
    if (kind === "positive") {
      const literalArm = arms.find((arm) => literalTruthiness(arm) === true);
      const wholeLiteral = arms.length === 1 && literalTruthiness(arms[0]) === true;
      if (literalArm !== undefined || wholeLiteral) {
        push(
          index,
          "literal-tautology",
          closeParen + 1,
          "a literal `true` arm satisfies this assertion on its own",
        );
      }
    } else {
      const andArms = splitTopLevel(received, "&&");
      const fixedFalsy =
        (andArms.length > 1 && andArms.some((arm) => literalTruthiness(arm) === false)) ||
        (arms.length === 1 && literalTruthiness(arms[0]) === false);
      if (fixedFalsy) {
        push(
          index,
          "literal-tautology",
          closeParen + 1,
          "a literal `false` arm satisfies this assertion on its own",
        );
      }
    }

    if (arms.length < 2) continue;

    // Rule 2 — complementary arms.
    for (let i = 0; i < arms.length; i += 1) {
      for (let j = i + 1; j < arms.length; j += 1) {
        if (isComplementaryPair(arms[i], arms[j])) {
          push(
            index,
            "complementary-arms",
            closeParen + 1,
            "the disjunction contains `P || !P` — always true",
          );
          i = arms.length;
          break;
        }
      }
    }

    // Rule 3 — a union of independent boolean observations over different
    // subjects. A same-subject shape union (`typeof x === "number" ||
    // x === undefined`) is the optional-field contract and can still fail.
    if (kind === "positive" && arms.every((arm) => isPredicateArm(arm, probes))) {
      const subjects = new Set(
        arms.map((arm) => armSubject(arm)).filter((subject): subject is string => Boolean(subject)),
      );
      if (subjects.size >= 2) {
        push(
          index,
          "any-of-assertion",
          closeParen + 1,
          `accepts any of ${arms.length} observations — a regression that moves between arms stays green`,
        );
      }
    }
  }

  return findings.sort((a, b) => a.index - b.index || a.rule.localeCompare(b.rule));
}

function collectTestFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      files.push(...collectTestFiles(full));
      continue;
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) continue;
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
  const testFiles = collectTestFiles(TESTS_DIR).map(toRepoPath);

  const findings: TrivialFinding[] = [];
  for (const file of testFiles) {
    const text = readFileSync(join(ROOT, file), "utf8");
    findings.push(...findTrivialAssertions(text, file));
  }

  if (findings.length > 0) {
    const writer = check ? console.error : console.warn;
    writer(`\n⚠️  Trivially-true assertion findings (${findings.length}):\n`);
    for (const finding of findings) {
      writer(`  ${finding.file}:${finding.line}  [${finding.rule}] ${finding.message}`);
      writer(`      → ${finding.assertion}`);
      writer(`      fix: ${FIX_HINTS[finding.rule]}`);
    }
    writer("");

    if (check) {
      console.error(
        `❌ Trivially-true assertion guard failed — ${findings.length} finding(s) in ${testFiles.length} test files.`,
      );
      process.exit(1);
    }

    console.log(
      `ℹ️  Advisory run — ${findings.length} finding(s). Re-run with --check to fail the gate.`,
    );
    return;
  }

  console.log(
    `✅ Trivially-true assertion lint OK — ${testFiles.length} test files, no unfailable assertions.`,
  );
}

// Only execute when run directly via CLI (not when imported by a unit test)
if (
  process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/lint/lint-trivially-true-assertions.ts")
) {
  run();
}
