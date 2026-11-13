/**
 * @file tests/unit/scripts/lint-locale-format.test.ts
 * @description Fixtures for the locale-format scanner: `toLocale*String()` may
 * only appear inside `@utils/format-date` and `@utils/date`.
 */

import { describe, expect, it } from "vitest";
import { ALLOWED_FILES, findLocaleFormatCalls } from "../../../scripts/lint/lint-locale-format";

const file = (path: string, source: string) => ({ path, source });

describe("findLocaleFormatCalls", () => {
  it("flags every toLocale*String form", () => {
    const offenses = findLocaleFormatCalls([
      file("src/routes/(app)/x/+page.svelte", "{createdAt.toLocaleDateString()}"),
      file("src/services/y.ts", "const t = d.toLocaleTimeString('en-US');"),
      file("src/plugins/z.ts", "const n = count.toLocaleString('en-US');"),
    ]);

    expect(offenses).toEqual([
      { file: "src/routes/(app)/x/+page.svelte", line: 1, call: "toLocaleDateString" },
      { file: "src/services/y.ts", line: 1, call: "toLocaleTimeString" },
      { file: "src/plugins/z.ts", line: 1, call: "toLocaleString" },
    ]);
  });

  it("allows the formatter implementations", () => {
    const sources = [...ALLOWED_FILES].map((path) =>
      file(path, "return value.toLocaleString(locale, options);"),
    );

    expect(findLocaleFormatCalls(sources)).toEqual([]);
  });

  it("does not flag the Intl primitives the helpers wrap", () => {
    const offenses = findLocaleFormatCalls([
      file(
        "src/services/pinned.ts",
        "const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'short' });\n" +
          "const num = new Intl.NumberFormat(locale).format(value);",
      ),
    ]);

    expect(offenses).toEqual([]);
  });

  it("ignores comments and honoured suppressions", () => {
    const offenses = findLocaleFormatCalls([
      file("src/services/a.ts", "// never use toLocaleDateString()\n"),
      file("src/services/b.ts", " * d.toLocaleString() breaks hydration\n"),
      file(
        "src/services/c.ts",
        "// lint-locale-format: allow <reason> third-party value is already formatted\n" +
          "const s = d.toLocaleDateString();",
      ),
      file(
        "src/services/d.ts",
        "const s = d.toLocaleDateString(); // lint-locale-format: allow <reason> pre-formatted",
      ),
    ]);

    expect(offenses).toEqual([]);
  });
});
