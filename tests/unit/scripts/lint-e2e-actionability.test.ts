/**
 * @file tests/unit/scripts/lint-e2e-actionability.test.ts
 * @description Fixtures for the E2E force/sleep workaround scanner.
 */

import { describe, expect, it } from "vitest";
import { findActionabilityWorkarounds } from "../../../scripts/lint/lint-e2e-actionability";

const file = (path: string, source: string) => ({ path, source });

describe("findActionabilityWorkarounds", () => {
  it("flags an unjustified force click in a spec", () => {
    const offenses = findActionabilityWorkarounds([
      file("tests/e2e/routes/x.spec.ts", "await btn.click({ force: true });"),
    ]);

    expect(offenses).toEqual([{ file: "tests/e2e/routes/x.spec.ts", line: 1, kind: "force" }]);
  });

  it("accepts a reviewed force/sleep exception", () => {
    const offenses = findActionabilityWorkarounds([
      file(
        "tests/e2e/routes/y.spec.ts",
        [
          "// force-allow: modal overlay intercepts the trigger",
          "await btn.click({ force: true });",
          "// wait-allow: transition settle",
          "await page.waitForTimeout(250);",
        ].join("\n"),
      ),
    ]);

    expect(offenses).toEqual([]);
  });

  it("ignores helpers, comments and unrelated force options", () => {
    const offenses = findActionabilityWorkarounds([
      file("tests/e2e/helpers/auth.ts", "await btn.click({ force: true });"),
      file("tests/e2e/routes/z.spec.ts", "// await btn.click({ force: true });"),
      file("tests/e2e/global.setup.ts", "rmSync(path, { recursive: true, force: true });"),
    ]);

    expect(offenses).toEqual([]);
  });
});
