/**
 * @file tests/unit/scripts/lint-design.test.ts
 * @description Pins the four violation groups of the design-system linter
 * (`scripts/lint/lint-design.ts`): dead/legacy class patterns, unresolved
 * `preset-*` tokens, the `AdminCard` prop guard and nested `<style>` blocks —
 * plus the two escape hatches (comment lines, the `design-system-preview.svelte`
 * exemption) and the process-wide regex-cursor reset the aggregated gate relies on.
 *
 * Why: this lint runs inside `scripts/check/run-source-lints.ts`, which shares one
 * process across the whole tree. A dead-class pattern that stops firing (or a
 * cursor that leaks between files) silently approves Skeleton-era classes that
 * have no CSS in Tailwind v4.
 */

import { describe, expect, it } from "vitest";

import { findDesignViolations, type DesignSourceFile } from "../../../scripts/lint/lint-design";

const DYNAMIC_COLORS = [
  "primary",
  "secondary",
  "tertiary",
  "success",
  "warning",
  "error",
  "surface",
] as const;

/**
 * Every recipe the dynamic-colour safelist requires. Without it `missingDynamic`
 * is non-empty by design, so a "clean" fixture must supply the full set.
 */
const DYNAMIC_CSS = DYNAMIC_COLORS.flatMap((color) => [
  `@utility preset-filled-${color}-500 { }`,
  `@utility preset-outlined-${color}-500 { }`,
  `@utility preset-ghost-${color}-500 { }`,
  `@utility preset-tonal-${color} { }`,
]).join("\n");

const APP_CSS: DesignSourceFile = { path: "src/app.css", source: DYNAMIC_CSS };

function svelte(path: string, source: string): DesignSourceFile {
  return { path, source };
}

function lint(source: string, path = "src/components/example.svelte") {
  return findDesignViolations([svelte(path, source)], [APP_CSS]);
}

describe("dead / legacy class patterns", () => {
  it("flags a legacy Skeleton variant class with its 1-based line", () => {
    const result = lint(`<script>\n  let x = 1;\n</script>\n<div class="variant-filled"></div>`);

    expect(result.deadClassOffenses).toHaveLength(1);
    expect(result.deadClassOffenses[0]).toMatchObject({
      file: "src/components/example.svelte",
      line: 4,
    });
    expect(result.deadClassOffenses[0].reason).toContain("Legacy Skeleton variant");
    expect(result.ok).toBe(false);
  });

  it("flags the misspelled preset-outline spelling", () => {
    const result = lint(`<div class="preset-outline-surface-500"></div>`);

    const reasons = result.deadClassOffenses.map((offense) => offense.reason);
    expect(reasons.some((reason) => reason.includes("preset-outlined-*"))).toBe(true);
  });

  it("flags a legacy light/dark range token", () => {
    const result = lint(`<div class="text-surface-600-300"></div>`);

    expect(result.deadClassOffenses).toHaveLength(1);
    expect(result.deadClassOffenses[0].reason).toContain("range token");
  });

  it("accepts the explicit light/dark pair that replaces a range token", () => {
    const result = lint(`<div class="text-surface-600 dark:text-surface-300"></div>`);

    expect(result.deadClassOffenses).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("skips comment lines so documentation examples never gate", () => {
    const result = lint(
      [
        "// variant-filled is the legacy Skeleton name",
        "/* preset-outline-surface-500 is documented as wrong */",
        " * text-surface-600-300 is the old range form",
      ].join("\n"),
    );

    expect(result.deadClassOffenses).toEqual([]);
  });
});

describe("preset token resolution", () => {
  it("reports a preset that no stylesheet defines", () => {
    const result = lint(`<div class="preset-filled-sunset-500"></div>`);

    expect(result.unresolvedPresetOffenses).toEqual([
      { file: "src/components/example.svelte", line: 1, name: "preset-filled-sunset-500" },
    ]);
  });

  it("resolves @utility and @source inline() brace expansions", () => {
    const css: DesignSourceFile = {
      path: "src/utilities.css",
      source: [
        "@utility preset-ghost-error-500 { }",
        '@source inline("preset-{filled,tonal}-{primary,error}-500");',
      ].join("\n"),
    };
    const result = findDesignViolations(
      [
        svelte(
          "src/components/example.svelte",
          `<div class="preset-ghost-error-500 preset-tonal-primary-500"></div>`,
        ),
      ],
      [css],
    );

    expect(result.unresolvedPresetOffenses).toEqual([]);
    expect(result.definedPresetCount).toBe(5);
    // `preset-outlined-error-500` is not in the brace list — it must still fail.
    const missing = findDesignViolations(
      [svelte("src/components/example.svelte", `<div class="preset-outlined-error-500"></div>`)],
      [css],
    );
    expect(missing.unresolvedPresetOffenses.map((offense) => offense.name)).toEqual([
      "preset-outlined-error-500",
    ]);
  });

  it("requires every dynamic colour recipe in the safelist", () => {
    const withoutSafelist = findDesignViolations(
      [svelte("src/components/example.svelte", `<div class="p-4"></div>`)],
      [],
    );

    expect(withoutSafelist.missingDynamic).toHaveLength(DYNAMIC_COLORS.length * 4);
    expect(withoutSafelist.missingDynamic).toContain("preset-tonal-surface");
    expect(withoutSafelist.ok).toBe(false);

    const withSafelist = findDesignViolations(
      [svelte("src/components/example.svelte", `<div class="p-4"></div>`)],
      [APP_CSS],
    );
    expect(withSafelist.missingDynamic).toEqual([]);
    expect(withSafelist.ok).toBe(true);
  });
});

describe("AdminCard prop guard", () => {
  it("flags variant/preset on an AdminCard opening tag", () => {
    const result = lint(
      `<AdminCard\n  title="x"\n  variant="filled"\n  preset="tonal"\n>body</AdminCard>`,
    );

    expect(result.cardViolations).toHaveLength(1);
    expect(result.cardViolations[0].line).toBe(1);
    expect(result.cardViolations[0].attribute).toBe('variant="filled" preset="tonal"');
  });

  it("accepts an AdminCard without variant/preset (the token path)", () => {
    const result = lint(`<AdminCard title="x">body</AdminCard>`);

    expect(result.cardViolations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("exempts only the design-system preview page", () => {
    const source = `<AdminCard variant="filled">body</AdminCard>`;

    const exempt = lint(source, "src/routes/(app)/config/design-system-preview.svelte");
    expect(exempt.cardViolations).toEqual([]);

    const elsewhere = lint(source, "src/routes/(app)/dashboard/overview.svelte");
    expect(elsewhere.cardViolations).toHaveLength(1);
  });
});

describe("nested <style> blocks", () => {
  it("flags a <style> block followed by markup", () => {
    const result = lint(`<div>\n  <style>\n    p { color: red; }\n  </style>\n</div>`);

    expect(result.nestedStyleOffenses).toHaveLength(1);
    expect(result.nestedStyleOffenses[0]).toMatchObject({
      file: "src/components/example.svelte",
      line: 2,
    });
  });

  it("accepts a root-level <style> block at the end of the file", () => {
    const result = lint(`<div>hi</div>\n\n<style>\n  p { color: red; }\n</style>`);

    expect(result.nestedStyleOffenses).toEqual([]);
  });
});

describe("scope guards", () => {
  it("ignores CSS inputs and the lint's own source", () => {
    const result = findDesignViolations(
      [
        { path: "src/app.css", source: ".x { @apply variant-filled; }" },
        { path: "scripts/lint/lint-design.ts", source: `const s = "variant-filled";` },
      ],
      [APP_CSS],
    );

    expect(result.deadClassOffenses).toEqual([]);
    // The self-exclusion is path-scoped: an ordinary file with the same text fails.
    const ordinary = findDesignViolations(
      [{ path: "src/utils/state.ts", source: `const s = "variant-filled";` }],
      [APP_CSS],
    );
    expect(ordinary.deadClassOffenses).toHaveLength(1);
  });

  it("restarts the shared pattern cursor on every call", () => {
    // The first call leaves each global regex mid-string. A second call whose
    // offending token sits before that offset used to be missed entirely.
    const first = lint(`\n<p class="variant-filled"></p>`);
    expect(first.deadClassOffenses).toHaveLength(1);

    const second = lint(`class="variant-filled"`);
    expect(second.deadClassOffenses).toHaveLength(1);
  });
});
