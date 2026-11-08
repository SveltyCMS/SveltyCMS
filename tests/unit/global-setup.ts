/**
 * @file tests/unit/global-setup.ts
 * @description Vitest global coordinator teardown to ensure test-created folders
 * are automatically removed after unit tests complete locally.
 *
 * Features:
 * - Runs once in the main Vitest coordinator process after all workers exit
 * - Removes `config/private.test.ts`, `config/test-database`, `config/test-collections`,
 *   `.compiledCollections/test-collections`, `test-media`, `tests/integration/.media`,
 *   and `tests/e2e/.media`
 * - Never touches live user configuration or data (`config/private.ts`,
 *   `config/database`, `config/collections`, root `.compiledCollections`, `mediaFolder`)
 */

import { cleanupTestArtifacts } from "../../scripts/runs/integration-harness.ts";

export function setup(): () => void {
  const clean = () => {
    if (process.env.KEEP_TEST_ARTIFACTS === "1") return;
    cleanupTestArtifacts(process.cwd(), { quiet: true });
  };
  process.once("exit", clean);
  return clean;
}
