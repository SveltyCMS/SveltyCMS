/**
 * @file tests/unit/critical-test-paths.test.ts
 * @description Enforces the P0 critical-test manifest in CI.
 *
 * `tests/critical-test-paths.ts` is documented as the "single source of truth"
 * for P0 API/integration domains and E2E journeys, but historically nothing
 * invoked `verifyCriticalTestCoverage()` — so the manifest was decorative. This
 * test closes that gap: every P0 test file must exist on disk and contain at
 * least one test case.
 */

import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { verifyCriticalTestCoverage } from "../critical-test-paths";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

describe("P0 critical test manifest", () => {
  it("passes coverage verification (all P0 files exist and are populated)", () => {
    const result = verifyCriticalTestCoverage({ projectRoot: PROJECT_ROOT });
    if (!result.passed) {
      const detail = result.gaps
        .map((g) => `  [${g.type}] ${g.filePath} — ${g.message}`)
        .join("\n");
      expect(result.gaps, `P0 critical test gaps:\n${detail}`).toEqual([]);
    }
    expect(result.passed).toBe(true);
  });
});
