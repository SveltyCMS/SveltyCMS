/**
 * @file tests/unit/scripts/lint-e2e-hydration.test.ts
 * @description Unit tests for the E2E hydration guard
 * (scripts/lint/lint-e2e-hydration.ts) — rule 1 (direct change dispatch in a spec).
 *
 * Features:
 * - Flags `.dispatchEvent("change")` / `'change'` / backtick, with line numbers
 * - Flags the evaluate-wrapped variant `el.dispatchEvent("change")`
 * - Allows the `// hydration-ok: <reason>` exemption on the same or previous line
 * - Requires a reason: a bare `hydration-ok:` is still reported
 * - Ignores comments, string-only occurrences, `new Event("change")`, and other event types
 */
import { describe, expect, it } from "vitest";
import { findHydrationViolations } from "../../../scripts/lint/lint-e2e-hydration.ts";

function findings(text: string) {
  return findHydrationViolations(text, "<fixture>");
}

describe("lint-e2e-hydration — direct change dispatch", () => {
  it("flags a direct dispatch with its line number", () => {
    const text = [
      'const picker = page.getByTestId("group-select");',
      'await picker.dispatchEvent("change");',
    ].join("\n");

    const result = findings(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ file: "<fixture>", line: 2, rule: "change-dispatch" });
  });

  it("flags single quotes, backticks and extra arguments", () => {
    const text = [
      "await a.dispatchEvent('change');",
      "await b.dispatchEvent(`change`);",
      'await c.dispatchEvent("change", { bubbles: true });',
    ].join("\n");

    expect(findings(text).map((f) => f.line)).toEqual([1, 2, 3]);
  });

  it("flags the evaluate-wrapped variant", () => {
    const text = 'await el.evaluate((node) => node.dispatchEvent("change"));';
    expect(findings(text)).toHaveLength(1);
  });

  it("does not flag a dispatched event of another type or a constructed Event", () => {
    const text = [
      'await tile.dispatchEvent(fire("pointerdown", 1, 2, 1));',
      'await help.evaluate((el) => el.dispatchEvent(new Event("change")));',
    ].join("\n");

    expect(findings(text)).toHaveLength(0);
  });

  it("does not flag a commented-out dispatch or a string mention", () => {
    const text = [
      '// await picker.dispatchEvent("change");',
      '/* await picker.dispatchEvent("change"); */',
      "const example = \"await picker.dispatchEvent('change')\";",
    ].join("\n");

    expect(findings(text)).toHaveLength(0);
  });

  it("honours the hydration-ok exemption on the same line", () => {
    const text = 'await picker.dispatchEvent("change"); // hydration-ok: native-only select';
    expect(findings(text)).toHaveLength(0);
  });

  it("honours the hydration-ok exemption on the previous line", () => {
    const text = [
      "// hydration-ok: deliberate DOM probe after waitForHydration",
      'await picker.dispatchEvent("change");',
    ].join("\n");

    expect(findings(text)).toHaveLength(0);
  });

  it("still reports a hydration-ok annotation without a reason", () => {
    const text = 'await picker.dispatchEvent("change"); // hydration-ok:';
    expect(findings(text)).toHaveLength(1);
  });

  it("does not let one match consume the next one's line count", () => {
    const text = [
      'await a.dispatchEvent("change");',
      "const untouched = 1;",
      'await b.dispatchEvent("change");',
    ].join("\n");

    expect(findings(text).map((f) => f.line)).toEqual([1, 3]);
  });
});
