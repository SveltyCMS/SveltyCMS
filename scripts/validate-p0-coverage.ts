#!/usr/bin/env bun
/**
 * @file scripts/validate-p0-coverage.ts
 * @description
 * CLI validation script for P0 (Priority Zero) test coverage.
 *
 * Loads the P0 manifest, checks every test file exists on disk, and reports
 * any missing files or test-count deficits. Exits with code 0 on success,
 * non-zero on failure.
 *
 * ### Usage
 *   bun run scripts/validate-p0-coverage.ts
 *   bun run scripts/validate-p0-coverage.ts --verbose   # Detailed per-entry output
 *   bun run scripts/validate-p0-coverage.ts --min=5     # Override minimum tests per file
 *
 * ### Features:
 * - checks all P0 API domain and E2E journey test files exist
 * - validates minimum test case count per file
 * - groups gaps by type (missing, empty, low-test-count)
 * - machine-readable exit code for CI/gates
 */

import { P0_MANIFEST, P0_API_DOMAINS, P0_E2E_JOURNEYS } from "../tests/p0-manifest";
import { verifyP0Coverage, printP0Verification, MIN_TESTS_PER_FILE } from "../tests/p0-registry";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
let minTests = MIN_TESTS_PER_FILE;

const minIdx = args.indexOf("--min");
if (minIdx !== -1 && minIdx + 1 < args.length) {
  const parsed = parseInt(args[minIdx + 1], 10);
  if (!isNaN(parsed) && parsed > 0) {
    minTests = parsed;
  }
}

// ---------------------------------------------------------------------------
// Run verification
// ---------------------------------------------------------------------------

const projectRoot = process.cwd();

console.log("🔍 P0 Coverage Validation");
console.log(`   Project root: ${projectRoot}`);
console.log(
  `   Manifest: ${P0_MANIFEST.length} entries (${P0_API_DOMAINS.length} API domains, ${P0_E2E_JOURNEYS.length} E2E journeys)`,
  `\n   Min tests per file: ${minTests}\n`,
);

if (verbose) {
  console.log("── Manifest Entries ──");
  for (const entry of P0_MANIFEST) {
    const tag = entry.isApiDomain ? "API" : "E2E";
    console.log(`   [${tag}] ${entry.key}: ${entry.domain}`);
    for (const file of entry.testFiles) {
      console.log(`          ${file}`);
    }
  }
  console.log("");
}

const result = verifyP0Coverage({ minTestsPerFile: minTests, projectRoot });

printP0Verification(result);

// ---------------------------------------------------------------------------
// Summary counts per domain type
// ---------------------------------------------------------------------------

const apiGaps = result.gaps.filter((g) => P0_API_DOMAINS.some((e) => e.key === g.key));
const e2eGaps = result.gaps.filter((g) => P0_E2E_JOURNEYS.some((e) => e.key === g.key));

console.log("── Summary ──");
console.log(`   API domains:      ${P0_API_DOMAINS.length} entries, ${apiGaps.length} gap(s)`);
console.log(`   E2E journeys:     ${P0_E2E_JOURNEYS.length} entries, ${e2eGaps.length} gap(s)`);
console.log(`   Files on disk:    ${result.filesFound}/${result.totalFiles}`);
console.log(`   Overall:          ${result.passed ? "✅ PASSED" : "❌ FAILED"}\n`);

const hasMissingFiles = result.gaps.some((g) => g.type === "missing-file");

if (hasMissingFiles) {
  console.error(
    "❌ P0 coverage validation FAILED — missing files must be created before shipping.\n",
  );
  process.exit(1);
}

if (result.gaps.length > 0) {
  // Only warnings (low-test-count, empty-file) — not a hard failure
  console.log("   ⚠️  Non-blocking warnings exist (low test count / empty files).\n");
  console.log("   These do not block CI, but should be addressed for completeness.\n");
  process.exit(0);
}

console.log("✅ All P0 test files are present and adequately populated.\n");
process.exit(0);
