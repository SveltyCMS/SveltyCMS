#!/usr/bin/env bun
/**
 * @file scripts/check/check-route-manifest.ts
 * @description Fast-tier validation of the route → test coverage manifest.
 *
 * `tests/unit/route-test-coverage.test.ts` already asserts real parity between
 * `src/routes/(app)` and `APP_ROUTE_COVERAGE`, but it only runs inside the full
 * unit suite (~40 s). A consolidated or moved test file therefore reddened the
 * suite long after the commit that moved it, and was invisible to the ~4 s
 * static tier that every commit runs first.
 *
 * This check runs the same verification in the fast tier. It imports the
 * manifest module directly, so there is no second list to drift: a route added
 * without a row, a row whose route was deleted, and a listed test file that is
 * missing or empty all fail here before the suite is even started.
 *
 * Features:
 * - One manifest source of truth (`APP_ROUTE_COVERAGE`, imported, never copied)
 * - Bidirectional route parity (disk → manifest, manifest → disk)
 * - Existence + non-empty assertions for every listed test file
 * - Structured gap output, one line per gap
 *
 * Usage:
 *   bun run scripts/check/check-route-manifest.ts
 *
 * Exit: 0 when the manifest is consistent, 1 otherwise.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_ROUTE_COVERAGE, verifyAppRouteCoverage } from "../../tests/route-test-coverage.ts";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/**
 * Validates the route manifest against the routes and test files on disk.
 *
 * Pure wrapper around `verifyAppRouteCoverage` so the CLI and unit tests share
 * one implementation.
 */
export function validateRouteManifest(projectRoot: string): string[] {
  const result = verifyAppRouteCoverage({ projectRoot });
  return result.gaps.map((gap) =>
    gap.filePath ? `[${gap.type}] ${gap.route} → ${gap.filePath}` : `[${gap.type}] ${gap.route}`,
  );
}

function main(): number {
  const errors = validateRouteManifest(ROOT);
  const listedFiles = APP_ROUTE_COVERAGE.reduce((sum, entry) => sum + entry.testFiles.length, 0);

  if (errors.length > 0) {
    console.error(`❌ Route manifest invalid — ${errors.length} gap(s):`);
    for (const error of errors) console.error(`   - ${error}`);
    return 1;
  }

  console.log(
    `✅ Route manifest consistent (${APP_ROUTE_COVERAGE.length} routes, ${listedFiles} test-file links).`,
  );
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
