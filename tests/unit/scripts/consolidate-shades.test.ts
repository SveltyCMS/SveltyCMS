/**
 * @file tests/unit/scripts/consolidate-shades.test.ts
 * @description Pins the status-shade contract codemod in
 * `scripts/lint/consolidate-shades.ts`. Every mapping the `--check` gate relies
 * on is asserted as a before/after pair, together with the three advisory/escape
 * behaviours: comment-free `text-text-*` reporting, the `bg-surface-800`
 * advisory that must never gate, and the `class:`-directive exemption that must
 * not silence a normal token on the same line.
 *
 * Why: this guard runs inside `bun run check`. A dropped mapping (e.g. `text-*-700`)
 * or a leaking Svelte directive exemption reintroduces the "too many reds" drift
 * the contract exists to prevent — with a green gate.
 */

import { describe, expect, it } from "vitest";

import { SHADE_EXCLUDED_FILES, analyzeShadeSource } from "../../../scripts/lint/consolidate-shades";

/** Applies the contract to a single source string. */
function migrate(source: string): string {
  return analyzeShadeSource(source).text;
}

describe("status-shade migrations", () => {
  it("collapses the wash shades onto the {hue}-500/10 recipe", () => {
    expect(migrate(`<div class="bg-red-50">`)).toBe(`<div class="bg-error-500/10">`);
    expect(migrate(`<div class="bg-red-100">`)).toBe(`<div class="bg-error-500/10">`);
    expect(migrate(`<div class="bg-error-500/5">`)).toBe(`<div class="bg-error-500/10">`);
    expect(migrate(`<div class="bg-error-500/15">`)).toBe(`<div class="bg-error-500/10">`);
  });

  it("collapses the dark wash and the 950 ramp", () => {
    expect(migrate(`<div class="bg-error-900/40">`)).toBe(`<div class="bg-error-900/20">`);
    expect(migrate(`<div class="bg-error-950">`)).toBe(`<div class="bg-error-500/10">`);
    expect(migrate(`<div class="bg-error-950/20">`)).toBe(`<div class="bg-error-900/20">`);
  });

  it("maps emphasis text to the 600/400 pair", () => {
    expect(migrate(`<p class="text-red-700">`)).toBe(`<p class="text-error-600">`);
    expect(migrate(`<p class="text-red-800">`)).toBe(`<p class="text-error-600">`);
    expect(migrate(`<p class="dark:text-red-200">`)).toBe(`<p class="dark:text-error-400">`);
    expect(migrate(`<p class="dark:text-amber-300">`)).toBe(`<p class="dark:text-warning-400">`);
  });

  it("maps borders onto the soft and emphasis recipes", () => {
    expect(migrate(`<p class="border-green-200">`)).toBe(`<p class="border-success-500/30">`);
    expect(migrate(`<p class="border-green-900">`)).toBe(`<p class="border-success-500/40">`);
    expect(migrate(`<p class="border-l-blue-400">`)).toBe(`<p class="border-l-tertiary-500">`);
    expect(migrate(`<p class="dark:border-error-700">`)).toBe(
      `<p class="dark:border-error-500/40">`,
    );
  });

  it("remaps the legacy Tailwind hue names on every property", () => {
    expect(migrate(`<div class="ring-rose-500">`)).toBe(`<div class="ring-error-500">`);
    expect(migrate(`<div class="from-orange-400">`)).toBe(`<div class="from-warning-400">`);
    expect(migrate(`<div class="fill-emerald-600">`)).toBe(`<div class="fill-success-600">`);
  });

  it("leaves hues outside the accent contract untouched", () => {
    const source = `<div class="bg-purple-500 text-indigo-700">`;

    expect(migrate(source)).toBe(source);
  });

  it("reports the 1-based line of every replacement", () => {
    const result = analyzeShadeSource(
      [`<script>`, `  let x = 1;`, `</script>`, `<div class="bg-red-50">`].join("\n"),
    );

    expect(result.changes).toEqual([{ line: 4, from: `"bg-red-50`, to: `"bg-error-500/10` }]);
  });
});

describe("escape hatches", () => {
  it("never rewrites a class: directive that would gain an alpha slash", () => {
    const source = `<div class:bg-success-100={active}></div>`;

    expect(migrate(source)).toBe(source);
  });

  it("does not let the directive exemption silence a normal token on the line", () => {
    const source = `<div class="bg-warning-50" class:bg-success-100={active}></div>`;

    expect(migrate(source)).toBe(
      `<div class="bg-warning-500/10" class:bg-success-100={active}></div>`,
    );
  });

  it("keeps light text emphasis when the same string carries a solid fill", () => {
    const source = `<div class="p-4 bg-error-500 dark:text-error-200"></div>`;

    expect(migrate(source)).toBe(source);
    // The same token without the solid fill must still migrate.
    expect(migrate(`<div class="dark:text-error-200"></div>`)).toBe(
      `<div class="dark:text-error-400"></div>`,
    );
  });

  it("publishes the documented per-file exemptions", () => {
    expect(SHADE_EXCLUDED_FILES.has("app.css")).toBe(true);
    expect(SHADE_EXCLUDED_FILES.has("dropdown.svelte")).toBe(true);
    expect(SHADE_EXCLUDED_FILES.has("button.svelte")).toBe(false);
  });
});

describe("advisory and non-rewritten classes", () => {
  it("reports text-text-* without touching the source", () => {
    const result = analyzeShadeSource(`<p class="text-text-400">hello</p>`);

    expect(result.textTextViolations).toHaveLength(1);
    expect(result.textTextViolations[0].line).toBe(1);
    expect(result.textTextViolations[0].token).toContain("text-text-400");
    expect(result.changes).toEqual([]);
    expect(result.text).toBe(`<p class="text-text-400">hello</p>`);
  });

  it("counts bg-surface-800 as advisory-only", () => {
    const result = analyzeShadeSource(
      [`<div class="bg-surface-800">`, `<div class="dark:bg-surface-800">`].join("\n"),
    );

    expect(result.surface800Count).toBe(2);
    expect(result.changes).toEqual([]);
  });
});

describe("idempotency", () => {
  it("produces contract-compliant output on a second pass", () => {
    const once = migrate(
      [`<div class="bg-red-50">`, `<p class="text-red-700">`, `<p class="border-red-200">`].join(
        "\n",
      ),
    );

    expect(once).toBe(
      [
        `<div class="bg-error-500/10">`,
        `<p class="text-error-600">`,
        `<p class="border-error-500/30">`,
      ].join("\n"),
    );
    expect(analyzeShadeSource(once).changes).toEqual([]);
  });
});
