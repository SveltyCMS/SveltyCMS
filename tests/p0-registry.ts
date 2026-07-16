/**
 * @file tests/p0-registry.ts
 * @description
 * P0 (Priority Zero) test registry — provides runtime verification that every
 * P0 test file exists on disk and contains the expected minimum number of tests.
 *
 * Used by:
 *   - `scripts/validate-p0-coverage.ts` (CLI validation)
 *   - Pre-push quality gate via `scripts/precheck-shared.ts` BASE_TASKS
 *
 * ### Features:
 * - verify() checks all manifest files exist and have minimum test count
 * - getGaps() returns a structured list of missing files or test deficits
 * - vitest-compatible (no bun:test imports)
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { P0_MANIFEST } from "./p0-manifest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface P0Gap {
  /** The P0 key from the manifest */
  key: string;
  /** The domain or journey name */
  domain: string;
  /** Type of gap detected */
  type: "missing-file" | "low-test-count" | "empty-file";
  /** The file path that has the issue */
  filePath: string;
  /** Human-readable description of the gap */
  message: string;
}

export interface P0VerificationResult {
  /** All gaps found (empty if verification passes) */
  gaps: P0Gap[];
  /** Number of manifest entries verified */
  totalEntries: number;
  /** Number of test files checked */
  totalFiles: number;
  /** Number of files found on disk */
  filesFound: number;
  /** Whether verification passed (no gaps) */
  passed: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum number of test cases expected per P0 file.
 *  Files below this threshold are flagged as potentially under-tested.
 *  A value of 1 ensures files have at least one executable test.
 *  Playwright `setup()` calls are counted alongside `it()` and `test()`. */
export const MIN_TESTS_PER_FILE = 1;

/** Regex matching test-case declarations: it(), test(), or setup() from Playwright. */
const TEST_CASE_RE = /(?:^|\s)(?:it|test|setup)\s*\(["'`]/gm;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Count the number of test cases (it/test calls) in a file's source.
 */
function countTestCases(filePath: string): number {
  try {
    const content = readFileSync(filePath, "utf-8");
    const matches = content.match(TEST_CASE_RE);
    return matches ? matches.length : 0;
  } catch {
    return -1; // File unreadable
  }
}

/**
 * Check if a file exists on disk.
 */
function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

// ---------------------------------------------------------------------------
// Main verification
// ---------------------------------------------------------------------------

/**
 * Verify that all P0 manifest entries have their test files present and
 * contain an adequate number of test cases.
 *
 * @param options - Optional overrides
 * @param options.minTestsPerFile - Minimum tests per file (default: MIN_TESTS_PER_FILE)
 * @param options.projectRoot - Project root to resolve relative paths (default: process.cwd())
 * @returns A P0VerificationResult with any gaps found
 */
export function verifyP0Coverage(
  options: { minTestsPerFile?: number; projectRoot?: string } = {},
): P0VerificationResult {
  const minTests = options.minTestsPerFile ?? MIN_TESTS_PER_FILE;
  const root = options.projectRoot ?? process.cwd();

  const gaps: P0Gap[] = [];
  const checkedFiles = new Set<string>();
  const existingFiles = new Set<string>();

  for (const entry of P0_MANIFEST) {
    for (const relativePath of entry.testFiles) {
      const absolutePath = resolve(root, relativePath);
      checkedFiles.add(relativePath);

      // Check 1: File must exist
      if (!fileExists(absolutePath)) {
        gaps.push({
          key: entry.key,
          domain: entry.domain,
          type: "missing-file",
          filePath: relativePath,
          message: `P0 test file missing: ${relativePath} (required by "${entry.domain}")`,
        });
        continue;
      }
      existingFiles.add(relativePath);

      // Check 2: File must not be empty
      const stats = readFileSync(absolutePath, "utf-8");
      if (stats.trim().length === 0) {
        gaps.push({
          key: entry.key,
          domain: entry.domain,
          type: "empty-file",
          filePath: relativePath,
          message: `P0 test file is empty: ${relativePath} (required by "${entry.domain}")`,
        });
        continue;
      }

      // Check 3: File must have minimum test cases
      const testCount = countTestCases(absolutePath);
      if (testCount >= 0 && testCount < minTests) {
        gaps.push({
          key: entry.key,
          domain: entry.domain,
          type: "low-test-count",
          filePath: relativePath,
          message: `P0 test file has only ${testCount} test(s), expected at least ${minTests}: ${relativePath} (required by "${entry.domain}")`,
        });
      }
    }
  }

  return {
    gaps,
    totalEntries: P0_MANIFEST.length,
    totalFiles: checkedFiles.size,
    filesFound: existingFiles.size,
    passed: gaps.length === 0,
  };
}

/**
 * Pretty-print verification results to the console.
 */
export function printP0Verification(result: P0VerificationResult): void {
  const status = result.passed ? "PASSED" : "FAILED";

  console.log(`\n📋 P0 Coverage Verification — ${status}`);
  console.log(
    `   ${result.totalEntries} manifest entries, ${result.totalFiles} test files checked`,
  );
  console.log(`   ${result.filesFound}/${result.totalFiles} files found on disk\n`);

  if (result.gaps.length === 0) {
    console.log("   ✅ All P0 test files present and adequately populated.\n");
    return;
  }

  // Group gaps by type
  const missingFiles = result.gaps.filter((g) => g.type === "missing-file");
  const emptyFiles = result.gaps.filter((g) => g.type === "empty-file");
  const lowTestCount = result.gaps.filter((g) => g.type === "low-test-count");

  if (missingFiles.length > 0) {
    console.log(`   ❌ Missing Files (${missingFiles.length}):`);
    for (const gap of missingFiles) {
      console.log(`      - ${gap.filePath} (${gap.domain})`);
    }
    console.log("");
  }

  if (emptyFiles.length > 0) {
    console.log(`   ❌ Empty Files (${emptyFiles.length}):`);
    for (const gap of emptyFiles) {
      console.log(`      - ${gap.filePath} (${gap.domain})`);
    }
    console.log("");
  }

  if (lowTestCount.length > 0) {
    console.log(`   ⚠️  Low Test Count (${lowTestCount.length}):`);
    for (const gap of lowTestCount) {
      console.log(`      - ${gap.filePath}: ${gap.message}`);
    }
    console.log("");
  }
}
