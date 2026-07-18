/**
 * @file tests/e2e/routes/collection-builder/collection.spec.ts
 * @description Legacy full-flow spec — superseded by collection-create + collection-entry-status.
 *
 * Kept as a thin smoke re-export for CI projects that still reference this file.
 */

import { expect, test } from "@playwright/test";

test.describe("Full Collection & Widget Flow (legacy shim)", () => {
  // Deprecated file — kept so imports do not 404; suite is empty on purpose.
  test("deprecated suite placeholder", () => {
    expect(true).toBe(true);
  });
});
