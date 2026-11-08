/**
 * @file tests/unit/scripts/lint-silent-catch.test.ts
 * @description Fixtures for the empty-catch scanner.
 */

import { describe, expect, it } from "vitest";
import { findSilentCatches } from "../../../scripts/lint/lint-silent-catch";

const file = (path: string, source: string) => ({ path, source });

describe("findSilentCatches", () => {
  it("flags a bare empty catch", () => {
    const offenses = findSilentCatches([file("src/a.ts", "try { work(); } catch {}")]);

    expect(offenses).toEqual([{ file: "src/a.ts", line: 1 }]);
  });

  it("accepts a logged catch", () => {
    const offenses = findSilentCatches([
      file("src/b.ts", "try { work(); } catch (error) { logger.debug('failed', error); }"),
    ]);

    expect(offenses).toEqual([]);
  });

  it("accepts a written justification", () => {
    const offenses = findSilentCatches([
      file("src/c.ts", "try { work(); } catch { /* intentional: optional probe */ }"),
      file("src/d.ts", "try { work(); } catch {} // catch-allow: logger-free shim"),
    ]);

    expect(offenses).toEqual([]);
  });

  it("ignores cleanup .catch(() => {}) handlers", () => {
    const offenses = findSilentCatches([file("src/e.ts", "await cleanup().catch(() => {});")]);

    expect(offenses).toEqual([]);
  });
});
