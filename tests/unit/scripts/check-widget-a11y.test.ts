/**
 * @file tests/unit/scripts/check-widget-a11y.test.ts
 * @description Unit tests for the widget accessibility drift guard
 * (scripts/check-widget-a11y.mjs) — rules A (cursor-pointer on non-links) and
 * B (outline removal without a ring alternative) per docs/contributing/accessibility.mdx.
 *
 * Features:
 * - Rule A: flags cursor-pointer on <button>/<label>/<input>/components; allows <a>
 * - Rule B: flags raw-tag outline-none/outline-0 without ring; ring-0/ring-offset do not count
 * - Exemptions: raw form controls (global inset focus shadow), capitalized component tags
 * - Comment-safe: class="" inside HTML comments is ignored
 */
import { describe, expect, it } from "vitest";
import { auditWidgetA11y } from "../../../scripts/check-widget-a11y.mjs";

function findings(text: string) {
  return auditWidgetA11y(text, "<fixture>");
}

describe("check-widget-a11y — rule A (cursor-pointer on non-links)", () => {
  it("flags cursor-pointer on a <button>", () => {
    const result = findings('<button type="button" class="w-full cursor-pointer">Go</button>');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ rule: "A", tag: "button", line: 1 });
  });

  it("flags cursor-pointer on a multiline <button>", () => {
    const text = [
      "<button",
      '\ttype="button"',
      '\tclass="block w-full cursor-pointer text-start"',
      ">label</button>",
    ].join("\n");
    const result = findings(text);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe("A");
  });

  it("flags cursor-pointer passed into a capitalized <Button> component", () => {
    const result = findings('<Button variant="outline" class="w-full cursor-pointer">x</Button>');
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe("Button");
  });

  it("flags cursor-pointer on a <label> and an <input type=color>", () => {
    const label = findings('<label for="x" class="flex cursor-pointer">Field</label>');
    const input = findings('<input type="color" class="cursor-pointer" aria-label="c" />');
    expect(label[0].rule).toBe("A");
    expect(input[0].rule).toBe("A");
  });

  it("allows cursor-pointer on links (<a>)", () => {
    const result = findings('<a href="/x" class="cursor-pointer underline">Go</a>');
    expect(result).toHaveLength(0);
  });

  it("ignores cursor-pointer samples inside HTML comments", () => {
    const text = '<!-- example: <button class="cursor-pointer">not real</button> -->';
    expect(findings(text)).toHaveLength(0);
  });
});

describe("check-widget-a11y — rule B (outline removal without ring)", () => {
  it("flags focus:outline-none on a raw button without any ring", () => {
    const text =
      '<button class="w-8 rounded hover:scale-110 focus:scale-110 focus:outline-none" aria-label="x"></button>';
    const result = findings(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ rule: "B", tag: "button" });
  });

  it("accepts outline-none when a focus-visible ring is present", () => {
    const text =
      '<button class="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" aria-label="x"></button>';
    expect(findings(text)).toHaveLength(0);
  });

  it("does not treat ring-0 or ring-offset-2 as a visible ring", () => {
    const ringZero = findings('<button class="outline-none focus-visible:ring-0">x</button>');
    expect(ringZero[0].rule).toBe("B");
    const offsetOnly = findings('<button class="outline-none ring-offset-2">x</button>');
    expect(offsetOnly[0].rule).toBe("B");
  });

  it("exempts raw form controls (global inset focus shadow) and component tags", () => {
    const textarea = findings('<textarea class="w-full outline-none resize-y"></textarea>');
    expect(textarea).toHaveLength(0);
    const input = findings('<input class="outline-none focus:ring-0" aria-label="x" />');
    expect(input).toHaveLength(0);
    const component = findings('<Input class="outline-none" />');
    expect(component).toHaveLength(0);
  });
});

describe("check-widget-a11y — combined output", () => {
  it("reports both rules on one fixture with line/col locations", () => {
    const text = [
      "<section>",
      '  <button class="cursor-pointer focus:outline-none">A</button>',
      "</section>",
    ].join("\n");
    const result = findings(text);
    expect(result).toHaveLength(2);
    expect(result.every((f) => f.line === 2 && f.col >= 3)).toBe(true);
    expect(new Set(result.map((f) => f.rule))).toEqual(new Set(["A", "B"]));
  });
});
