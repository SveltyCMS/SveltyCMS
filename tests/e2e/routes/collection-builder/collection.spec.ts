/**
 * @file tests/e2e/routes/collection-builder/collection.spec.ts
 * @description Legacy full-flow spec — superseded by collection-create + collection-entry-status.
 *
 * Kept as a thin smoke re-export for CI projects that still reference this file.
 */

import { test } from "@playwright/test";

test.describe("Full Collection & Widget Flow (legacy shim)", () => {
  test.skip(true, "Split into collection-create.spec.ts and collection-entry-status.spec.ts");
});
