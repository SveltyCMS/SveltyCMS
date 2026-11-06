/**
 * @file tests/e2e/harness-paths.ts
 * @description Filesystem roots owned by the Playwright harness.
 *
 * The suite must never point `MEDIA_FOLDER` at the developer's `mediaFolder`:
 * `global.setup.ts` empties the media root before every run, and the dev server
 * serves that same directory from this checkout. A local E2E run therefore used
 * to delete the developer's uploads while leaving the dev DB rows behind.
 *
 * ### Features:
 * - `E2E_MEDIA_FOLDER` — absolute, gitignored media root for test uploads
 */

import { join } from "node:path";

/** Absolute media root owned by the E2E harness (never the dev `mediaFolder`). */
export const E2E_MEDIA_FOLDER = join(process.cwd(), "tests", "e2e", ".media");
