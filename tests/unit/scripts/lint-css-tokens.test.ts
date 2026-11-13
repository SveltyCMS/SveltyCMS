/**
 * @file tests/unit/scripts/lint-css-tokens.test.ts
 * @description Fixtures for the CSS token scanner: the palette must be emitted
 * (`@theme static`) and every literal `var(--color-…)` must resolve.
 */

import { describe, expect, it } from "vitest";
import {
  collectColorTokens,
  findCssTokenOffenses,
  findNonStaticThemeBlocks,
  findUndefinedColorTokens,
} from "../../../scripts/lint/lint-css-tokens";

const file = (path: string, source: string) => ({ path, source });

const THEME = file(
  "src/app.css",
  "@theme static {\n  --color-primary-500: #0ea5e9;\n  --color-surface-50: #ffffff;\n}\n",
);

describe("findNonStaticThemeBlocks", () => {
  it("flags a color ramp declared in a plain @theme block", () => {
    const offenses = findNonStaticThemeBlocks([
      file("src/app.css", "/* tokens */\n@theme {\n  --color-primary-500: #0ea5e9;\n}\n"),
    ]);

    expect(offenses).toHaveLength(1);
    expect(offenses[0]).toMatchObject({ file: "src/app.css", line: 2 });
  });

  it("accepts @theme static and blocks without color tokens", () => {
    const offenses = findNonStaticThemeBlocks([
      THEME,
      file("src/other.css", "@theme {\n  --font-display: 'Inter';\n}\n"),
    ]);

    expect(offenses).toEqual([]);
  });
});

describe("findUndefinedColorTokens", () => {
  it("flags a ramp reference that drops the shade suffix", () => {
    const offenses = findUndefinedColorTokens(
      [file("src/services/site/publish.ts", "nav a:hover { color: var(--color-primary); }")],
      [THEME],
    );

    expect(offenses).toEqual([
      expect.objectContaining({ file: "src/services/site/publish.ts", token: "--color-primary" }),
    ]);
  });

  it("accepts declared tokens and file-local definitions", () => {
    const offenses = findUndefinedColorTokens(
      [
        file("src/x.svelte", '<div style="color: var(--color-primary-500)"></div>'),
        file(
          "src/standalone.ts",
          ":root { --color-brand: #0284c7 }\nbody { color: var(--color-brand); }",
        ),
      ],
      [THEME],
    );

    expect(offenses).toEqual([]);
  });

  it("skips dynamic fragments that cannot be resolved statically", () => {
    const offenses = findUndefinedColorTokens(
      [
        file("src/y.ts", "const c = `var(--color-${shade}-500)`;"),
        file("src/z.css", ".a { color: var(--color-primary-); }"),
      ],
      [THEME],
    );

    expect(offenses).toEqual([]);
  });

  it("reports the line of the offending reference", () => {
    const offenses = findUndefinedColorTokens(
      [file("src/a.ts", "const a = 1;\nconst b = 2;\nconst c = 'var(--color-typo-900)';")],
      [THEME],
    );

    expect(offenses[0]).toMatchObject({ line: 3, token: "--color-typo-900" });
  });
});

describe("findCssTokenOffenses", () => {
  it("returns both rule families in one pass", () => {
    const offenses = findCssTokenOffenses(
      [file("src/a.svelte", '<div style="color: var(--color-ghost-500)"></div>')],
      [file("src/app.css", "@theme {\n  --color-primary-500: #0ea5e9;\n}\n")],
    );

    expect(offenses.map((offense) => offense.token)).toEqual([
      "--color-primary-500",
      "--color-ghost-500",
    ]);
  });
});

describe("collectColorTokens", () => {
  it("indexes every declared ramp", () => {
    expect([...collectColorTokens([THEME]).keys()]).toEqual([
      "--color-primary-500",
      "--color-surface-50",
    ]);
  });
});
