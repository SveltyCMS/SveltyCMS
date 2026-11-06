/**
 * @file tests/unit/scripts/lint-date-helpers.test.ts
 * @description Fixtures for the ISO-now scanner: only the date helper and the
 * log-file timestamp slicer may call `new Date().toISOString()` directly.
 */

import { describe, expect, it } from "vitest";
import { findDirectIsoNow } from "../../../scripts/lint/lint-date-helpers";

const file = (path: string, source: string) => ({ path, source });

describe("findDirectIsoNow", () => {
  it("flags a direct ISO-now call", () => {
    const offenses = findDirectIsoNow([
      file("src/services/x.ts", "const ts = new Date().toISOString();"),
    ]);

    expect(offenses).toEqual([{ file: "src/services/x.ts", line: 1 }]);
  });

  it("allows the helper implementation and log timestamps", () => {
    const offenses = findDirectIsoNow([
      file("src/utils/date.ts", "return new Date().toISOString();"),
      file("src/utils/logger.server.ts", "const ts = new Date().toISOString().slice(0, 19);"),
    ]);

    expect(offenses).toEqual([]);
  });

  it("ignores comments and honoured suppressions", () => {
    const offenses = findDirectIsoNow([
      file("src/services/y.ts", "// never use new Date().toISOString()\n"),
      file(
        "src/services/z.ts",
        "// lint-date-helpers: allow\nconst ts = new Date().toISOString();",
      ),
    ]);

    expect(offenses).toEqual([]);
  });
});
