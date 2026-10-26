/**
 * @file tests/unit/scripts/lint-trivially-true-assertions.test.ts
 * @description Unit tests for the unfailable-assertion guard
 * (scripts/lint/lint-trivially-true-assertions.ts).
 *
 * Features:
 * - Rule 1: literal truthy/falsy arms (`|| true`, `expect(true).toBe(true)`)
 * - Rule 2: complementary arms (`P || !P`, `x === 1 || x !== 1`)
 * - Rule 3: unions of independent observations, with the optional-field and
 *   value-fallback patterns allowed
 * - Rule 4: assertions swallowed by a try/catch around a mutation
 * - `// trivial-assert-ok: <reason>` exemption (reason mandatory)
 * - Comments, string fixtures and nested `||` are ignored
 */

import { describe, expect, it } from "vitest";
import {
  findTrivialAssertions,
  hasTopLevelEquality,
  isComplementaryPair,
  literalTruthiness,
  splitTopLevel,
} from "../../../scripts/lint/lint-trivially-true-assertions.ts";

function findings(text: string) {
  return findTrivialAssertions(text, "<fixture>");
}

function rules(text: string) {
  return findings(text).map((finding) => finding.rule);
}

describe("lint-trivially-true-assertions — rule 1 (literal arm)", () => {
  it("flags a trailing `|| true`, including the multi-line matcher form", () => {
    const text = [
      "expect(Array.isArray(media) || media === undefined || true).toBe(",
      "  true,",
      ");",
    ].join("\n");

    const result = findings(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ file: "<fixture>", line: 1, rule: "literal-tautology" });
  });

  it("flags a literal-only assertion", () => {
    expect(rules("expect(true).toBe(true);")).toEqual(["literal-tautology"]);
    expect(rules("expect(1).toBeTruthy();")).toEqual(["literal-tautology"]);
  });

  it("flags other fixed-truthy arms", () => {
    expect(rules("expect(a || 1).toBe(true);")).toEqual(["literal-tautology"]);
    expect(rules('expect(a || "always").toBeTruthy();')).toEqual(["literal-tautology"]);
    expect(rules("expect(a || []).not.toBeFalsy();")).toEqual(["literal-tautology"]);
  });

  it("flags a fixed-falsy `&&` arm under a falsy matcher", () => {
    expect(rules("expect(a && false).toBe(false);")).toEqual(["literal-tautology"]);
    expect(rules("expect(a && null).toBeFalsy();")).toEqual(["literal-tautology"]);
  });

  it("does not treat a falsy arm as truthy, or vice versa", () => {
    expect(rules("expect(a || 0).toBe(true);")).toEqual([]);
    expect(rules("expect(a || false).toBeTruthy();")).toEqual([]);
    expect(rules("expect(a && true).toBe(false);")).toEqual([]);
  });
});

describe("lint-trivially-true-assertions — rule 2 (complementary arms)", () => {
  it("flags `P || !P`", () => {
    expect(rules("expect(ready || !ready).toBe(true);")).toEqual(["complementary-arms"]);
    expect(rules("expect(!ready || ready).toBeTruthy();")).toEqual(["complementary-arms"]);
  });

  it("flags `x === c` against `x !== c`", () => {
    expect(rules('expect(status === "ok" || status !== "ok").toBe(true);')).toEqual([
      "complementary-arms",
    ]);
  });

  it("does not pair unrelated comparisons", () => {
    expect(rules('expect(a === "x" || b === "y").toBe(true);')).toEqual(["any-of-assertion"]);
    expect(isComplementaryPair("a === 1", "a !== 2")).toBe(false);
  });
});

describe("lint-trivially-true-assertions — rule 3 (any-of observations)", () => {
  it("flags local visibility probes", () => {
    const text = [
      "const emptyVisible = await empty.isVisible().catch(() => false);",
      "const gridVisible = await grid.isVisible().catch(() => false);",
      "expect(emptyVisible || gridVisible).toBe(true);",
    ].join("\n");

    expect(rules(text)).toEqual(["any-of-assertion"]);
  });

  it("flags a multi-line probe declaration", () => {
    const text = [
      "const roleVisible = await page",
      '  .getByText("Admin")',
      "  .first()",
      "  .isVisible()",
      "  .catch(() => false);",
      "const toastVisible = await page.getByText(/added/i).isVisible();",
      "expect(roleVisible || toastVisible).toBe(true);",
    ].join("\n");

    expect(rules(text)).toEqual(["any-of-assertion"]);
  });

  it("flags comparisons over different subjects", () => {
    expect(
      rules("expect(result.errors !== undefined || result.data !== undefined).toBe(true);"),
    ).toEqual(["any-of-assertion"]);
    expect(
      rules(
        "expect(body.success === true || Array.isArray(body) || Array.isArray(body?.data)).toBe(true);",
      ),
    ).toEqual(["any-of-assertion"]);
  });

  it("allows the optional-field shape union (same subject)", () => {
    expect(
      rules('expect(typeof body.uptime === "number" || body.uptime === undefined).toBe(true);'),
    ).toEqual([]);
    expect(
      rules(
        'expect(fast.lockoutUntil === null || typeof fast.lockoutUntil === "string").toBe(true);',
      ),
    ).toEqual([]);
  });

  it("allows a value fallback (both arms are values)", () => {
    expect(rules("expect(user.name || user.email).toBeTruthy();")).toEqual([]);
  });

  it("allows a single predicate and a nested `||`", () => {
    expect(rules("expect(Array.isArray(list)).toBe(true);")).toEqual([]);
    expect(rules("expect(list.some((row) => row.a || row.b)).toBe(true);")).toEqual([]);
  });

  it("ignores non-truthiness matchers", () => {
    expect(rules("expect(a || b).toContain(1);")).toEqual([]);
    expect(rules("expect(x === 1 || y === 2).not.toBe(false);")).toEqual(["any-of-assertion"]);
  });
});

describe("lint-trivially-true-assertions — rule 4 (swallowed assertion)", () => {
  it("flags an assertion swallowed by a catch after a mutation", () => {
    const text = [
      "try {",
      '  await page.getByTestId("save").click();',
      '  await expect(page.getByText("saved")).toBeVisible();',
      "} catch {",
      "  console.warn('cleanup failed');",
      "}",
    ].join("\n");

    const result = findings(text);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe("swallowed-assertion");
    expect(result[0].line).toBe(3);
  });

  it("flags an empty catch", () => {
    const text = [
      "try {",
      "  await fileInput.setInputFiles(file);",
      "  await expect(errorToast).toBeVisible();",
      "} catch {",
      "  // browser-level rejection is acceptable",
      "}",
    ].join("\n");

    expect(rules(text)).toEqual(["swallowed-assertion"]);
  });

  it("allows a rethrow, expect.fail or an alternative assertion in catch", () => {
    const rethrow = [
      "try {",
      "  await button.click();",
      "  await expect(a).toBeVisible();",
      "} catch (err) {",
      "  throw err;",
      "}",
    ].join("\n");
    expect(rules(rethrow)).toEqual([]);

    const alternative = [
      "try {",
      '  await page.getByTestId("save").click();',
      "  expect(result.success).toBe(false);",
      "} catch (err) {",
      "  expect(String(err)).toMatch(/null|invalid/i);",
      "}",
    ].join("\n");
    expect(rules(alternative)).toEqual([]);
  });

  it("allows a wait-only try whose catch selects the other branch", () => {
    const text = [
      "try {",
      "  await page.waitForURL(/\\/login/, { timeout: 5_000 });",
      "  expect(page.url()).toMatch(/login/);",
      "} catch {",
      "  console.log('provider not configured');",
      "}",
    ].join("\n");

    expect(rules(text)).toEqual([]);
  });
});

describe("lint-trivially-true-assertions — exemptions and scope", () => {
  it("honours the exemption on the same line", () => {
    const text = "expect(a || true).toBe(true); // trivial-assert-ok: fixture probe";
    expect(findings(text)).toEqual([]);
  });

  it("honours the exemption on the previous line", () => {
    const text = [
      "// trivial-assert-ok: provider may be configured or not",
      "expect(configured || !configured).toBe(true);",
    ].join("\n");

    expect(findings(text)).toEqual([]);
  });

  it("still reports an annotation without a reason", () => {
    const text = "expect(a || true).toBe(true); // trivial-assert-ok:";
    expect(rules(text)).toEqual(["literal-tautology"]);
  });

  it("ignores commented-out and quoted assertions", () => {
    const text = [
      "// expect(a || true).toBe(true);",
      "/* expect(a || true).toBe(true); */",
      'const example = "expect(a || true).toBe(true);";',
    ].join("\n");

    expect(findings(text)).toEqual([]);
  });

  it("does not let one finding consume the next one's line number", () => {
    const text = [
      "expect(a || true).toBe(true);",
      "const untouched = 1;",
      "expect(b && false).toBe(false);",
    ].join("\n");

    expect(findings(text).map((finding) => finding.line)).toEqual([1, 3]);
  });
});

describe("lint-trivially-true-assertions — helpers", () => {
  it("splits only top-level operators", () => {
    expect(splitTopLevel("a || b || c", "||")).toEqual(["a", "b", "c"]);
    expect(splitTopLevel("fn(a || b) || c", "||")).toEqual(["fn(a || b)", "c"]);
    expect(splitTopLevel("a && b", "||")).toEqual(["a && b"]);
  });

  it("recognises literal truthiness", () => {
    expect(literalTruthiness("true")).toBe(true);
    expect(literalTruthiness('"x"')).toBe(true);
    expect(literalTruthiness("0")).toBe(false);
    expect(literalTruthiness("2")).toBe(true);
    expect(literalTruthiness("name")).toBeNull();
  });

  it("finds only top-level equality", () => {
    expect(hasTopLevelEquality("a === b")).toBe(true);
    expect(hasTopLevelEquality("fn(a === b)")).toBe(false);
    expect(hasTopLevelEquality('"a===b"')).toBe(false);
  });
});
