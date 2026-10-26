/**
 * @file tests/unit/scripts/lint-e2e-hydration.test.ts
 * @description Unit tests for the E2E hydration guard
 * (scripts/lint/lint-e2e-hydration.ts) — rule 1 (direct change dispatch in a spec)
 * and rule 2 (ungated click on a control that ships disabled until hydration).
 *
 * Features:
 * - Flags `.dispatchEvent("change")` / `'change'` / backtick, with line numbers
 * - Flags the evaluate-wrapped variant `el.dispatchEvent("change")`
 * - Allows the `// hydration-ok: <reason>` exemption on the same or previous line
 * - Requires a reason: a bare `hydration-ok:` is still reported
 * - Ignores comments, string-only occurrences, `new Event("change")`, and other event types
 * - Flags an unproven click on a gated control; accepts an enabled assertion or a
 *   hydration helper earlier in the same test body; resolves locators held in
 *   variables (multi-line assignments) and the testid-less /shop add-to-cart button
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

describe("lint-e2e-hydration — ungated clicks on gated controls", () => {
  /** A test body whose lines precede one click on a hydration-gated control. */
  function specWith(prelude: string[]): string {
    return [
      'test("golden", async ({ page }) => {',
      ...prelude,
      '  await page.getByTestId("webhooks-add").click();',
      "});",
    ].join("\n");
  }

  it("flags a bare click on a gated control", () => {
    const result = findings(specWith([]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ rule: "ungated-click", line: 2 });
  });

  it("accepts a gated-control enabled assertion earlier in the test body", () => {
    const prelude = ['  await expect(page.getByTestId("webhooks-add")).toBeEnabled();'];
    expect(findings(specWith(prelude))).toHaveLength(0);
  });

  it("accepts waitForHydration / runAfterHydration earlier in the test body", () => {
    expect(findings(specWith(["  await waitForHydration(page);"]))).toHaveLength(0);
    expect(
      findings(specWith(['  await runAfterHydration(page, () => page.getByTestId("x").click());'])),
    ).toHaveLength(0);
  });

  it("resolves a locator held in a variable, across lines", () => {
    const text = [
      'test("golden", async ({ page }) => {',
      "  const editBtn = page",
      '    .getByTestId("edit-user-settings-btn")',
      "    .first();",
      "  await editBtn.click();",
      "});",
    ].join("\n");

    expect(findings(text).map((f) => f.rule)).toEqual(["ungated-click"]);
  });

  it("flags the /shop add-to-cart button by label (it has no testid)", () => {
    const text = [
      'test("guest", async ({ page }) => {',
      '  const addBtn = page.getByRole("button", { name: "Add to cart" }).first();',
      "  await addBtn.click();",
      "});",
    ].join("\n");

    expect(findings(text)).toHaveLength(1);
  });

  it("ignores clicks on controls that are not gated", () => {
    const text = [
      'test("other", async ({ page }) => {',
      '  await page.getByTestId("webhook-delete").click();',
      '  await page.getByRole("button", { name: /save/i }).click();',
      "});",
    ].join("\n");

    expect(findings(text)).toHaveLength(0);
  });
});
