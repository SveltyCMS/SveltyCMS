/**
 * @file tests/critical-test-paths.ts
 * @description
 * Critical test paths manifest and registry — maps every critical API/integration domain
 * and E2E journey to its corresponding test file(s), and provides runtime verification
 * that every critical test file exists on disk and contains the expected minimum number
 * of tests.
 *
 * ### Critical API / Integration Domains (must stay green on all DBs)
 * ### Critical E2E Journeys (must stay green in CI)
 *
 * Used by:
 *   - Manual / CI inventory checks (critical path completeness)
 *   - `bun run test:doctor` / three-layer docs as the critical-path inventory
 *
 * Reference: docs/tests/three-layer-completeness.mdx (lines 171-193)
 *
 * ### Features:
 * - typed manifest entries with domain, testFiles, and description
 * - separate exports for API domains and E2E journeys
 * - verify() checks all manifest files exist and have minimum test count
 * - getGaps() returns a structured list of missing files or test deficits
 * - vitest-compatible (no bun:test imports)
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CriticalTestEntry {
  /** Short unique key for the critical item */
  key: string;
  /** Human-readable domain or journey name */
  domain: string;
  /** Test file paths relative to project root */
  testFiles: string[];
  /** Brief description of what this critical item covers */
  description: string;
  /** Whether this is an API/integration domain (vs E2E journey) */
  isApiDomain: boolean;
  /** Whether this is an E2E journey */
  isE2EJourney: boolean;
}

export interface CriticalTestGap {
  /** The critical test key from the manifest */
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

export interface CriticalTestVerificationResult {
  /** All gaps found (empty if verification passes) */
  gaps: CriticalTestGap[];
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

/** Minimum number of test cases expected per critical test file.
 *  Files below this threshold are flagged as potentially under-tested.
 *  A value of 1 ensures files have at least one executable test.
 *  Playwright `setup()` calls are counted alongside `it()` and `test()`. */
export const MIN_TESTS_PER_FILE = 1;

/** Regex matching test-case declarations: it(), test(), or setup() from Playwright. */
const TEST_CASE_RE = /(?:^|\s)(?:it|test|setup)\s*\(["'`]/gm;

// ---------------------------------------------------------------------------
// Critical API / Integration Domains
// ---------------------------------------------------------------------------

export const CRITICAL_API_DOMAINS: CriticalTestEntry[] = [
  {
    key: "auth-login",
    domain: "Auth login/session",
    testFiles: [
      "tests/integration/api/user.test.ts",
      "tests/integration/api/auth-lockout.test.ts",
      "tests/integration/api/session-page-load.test.ts",
      "tests/integration/databases/contract.test.ts",
      "tests/unit/auth/session-cookies.test.ts",
    ],
    description:
      "Admin can login, get session cookie, reuse session on API and (app) __data page loads, wrong credentials rejected; loopback cookies never Secure/__Host-",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "webhooks-http",
    domain: "Webhooks HTTP (Testing 2026 reference)",
    testFiles: ["tests/integration/api/webhooks.test.ts"],
    description:
      "Admin list/create/delete webhooks via /api/webhooks; unauthenticated 401; editor without config:webhooks denied",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "automations-http",
    domain: "Automations HTTP",
    testFiles: ["tests/integration/api/automations.test.ts"],
    description: "Admin list/create/delete automations; unauth 401; editor denied on GET/POST",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "config-admin-surface",
    domain: "Config admin HTTP surface (trash/queue/workflows/sync/widgets/logs)",
    testFiles: [
      "tests/integration/api/config-admin-surface.test.ts",
      "tests/integration/api/collection-structure.test.ts",
    ],
    description:
      "Unauth 401 + admin GET for trash, system-jobs, workflows, config status, widgets list, logs; mutation unauth denials; collections structure readable",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "user-crud",
    domain: "User CRUD + batch",
    testFiles: [
      "tests/integration/api/user.test.ts",
      "tests/integration/api/user-extended.test.ts",
      "tests/integration/databases/contract.test.ts",
    ],
    description:
      "Admin can create users, perform batch operations (block/unblock), update user attributes",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "collections-crud",
    domain: "Collections content CRUD",
    testFiles: [
      "tests/integration/api/collections.test.ts",
      "tests/integration/databases/contract.test.ts",
    ],
    description:
      "Collections CRUD via config-sync, list collections, create and read entries, search",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "media-permissions",
    domain: "Media write/delete permissions",
    testFiles: [
      "tests/integration/api/media.test.ts",
      "tests/integration/databases/contract.test.ts",
    ],
    description:
      "Media upload requires media:write, delete requires media:delete, unauthenticated access rejected",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "setup-gating",
    domain: "Setup gating (post-complete blocked)",
    testFiles: [
      "tests/integration/api/setup-actions.test.ts",
      "tests/integration/databases/contract.test.ts",
    ],
    description:
      "After setup completes, /api/setup/complete and /api/setup/seed must be blocked with non-200 status",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "fail-closed",
    domain: "Fail-closed unknown / forbidden routes",
    testFiles: [
      "tests/integration/api/security-negative.test.ts",
      "tests/integration/databases/contract.test.ts",
    ],
    description:
      "Unknown API namespace → 403, unmapped sub-endpoint → 404, protected endpoint without auth → 401",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "multi-tenant",
    domain: "Multi-tenant isolation when MT enabled",
    testFiles: [
      "tests/integration/api/security-negative.test.ts",
      "tests/e2e/multi-tenancy/isolation.spec.ts",
      "tests/integration/databases/contract.test.ts",
    ],
    description:
      "Cross-tenant data access blocked via spoofed tenantId; tenant-scoped queries enforced",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "schema-hooks",
    domain: "Schema lifecycle hooks (beforeValidate/afterValidate)",
    testFiles: ["tests/unit/content/schema-hooks.test.ts"],
    description:
      "beforeValidate runs before field validation for normalization; afterValidate runs after for computed transforms; pipeline runs in correct order; errors in validate block pipeline",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "outbox",
    domain: "Transactional outbox — durable event delivery",
    testFiles: ["tests/unit/services/outbox-service.test.ts"],
    description:
      "Events inserted to svelty_outbox; exponential backoff via outboxBackoffMs; processBatch delivers ready events and marks delivered; failed events increment attempts; max-attempts dead-letter to failed; cleanup deletes old delivered events",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "cache-service",
    domain: "Cache service — key generation, TTL, invalidation",
    testFiles: ["tests/unit/databases/cache-service.test.ts"],
    description:
      "generateKey produces tenant-scoped keys, tenant isolation, pattern clearing, concurrent safety, TTL handling, category-based invalidation",
    isApiDomain: true,
    isE2EJourney: false,
  },
  {
    key: "job-queue",
    domain: "Job queue — dispatch, handlers, polling",
    testFiles: ["tests/unit/services/job-queue-service.test.ts"],
    description:
      "registerHandler accepts custom handlers; dispatch creates pending jobs and returns id; dispatch returns null when DB/API unavailable; startPolling respects BENCHMARK_MODE and DISABLE_JOBS; processNextBatch no-ops when no ready jobs",
    isApiDomain: true,
    isE2EJourney: false,
  },
];

// ---------------------------------------------------------------------------
// Critical E2E Journeys
// ---------------------------------------------------------------------------

export const CRITICAL_E2E_JOURNEYS: CriticalTestEntry[] = [
  {
    key: "e2e-setup-wizard",
    domain: "Setup wizard completes",
    testFiles: ["tests/e2e/routes/setup/setup-wizard.spec.ts"],
    description: "Full setup wizard flow completes successfully in CI",
    isApiDomain: false,
    isE2EJourney: true,
  },
  {
    key: "e2e-admin-login",
    domain: "Admin login → authenticated shell",
    testFiles: ["tests/e2e/routes/login/login.spec.ts", "tests/e2e/auth.setup.ts"],
    description:
      "Admin can login with valid credentials and reach the authenticated dashboard/shell",
    isApiDomain: false,
    isE2EJourney: true,
  },
  {
    key: "e2e-collection-builder",
    domain: "Collection builder: shell + golden journey",
    testFiles: [
      "tests/e2e/routes/collection-builder/builder.spec.ts",
      "tests/integration/api/collection-structure.test.ts",
      "tests/unit/routes/collectionbuilder-page-server.test.ts",
    ],
    description:
      "Shell: board/add-collection chrome. Golden: schema → entry → API. Structure/utils covered in unit+integration (not 9 E2E files).",
    isApiDomain: false,
    isE2EJourney: true,
  },
  {
    key: "e2e-entry-crud",
    domain: "Create/list entry on a collection",
    testFiles: [
      "tests/e2e/routes/collection-builder/builder.spec.ts",
      "tests/integration/api/collections.test.ts",
    ],
    description:
      "Golden E2E creates entry + API asserts content/status; collections HTTP integration for list/CRUD",
    isApiDomain: false,
    isE2EJourney: true,
  },
  {
    key: "e2e-logout",
    domain: "Logout / unauthenticated redirect",
    testFiles: ["tests/e2e/routes/login/login.spec.ts", "tests/e2e/auth.setup.ts"],
    description: "Logout from admin session and verify redirect to login page",
    isApiDomain: false,
    isE2EJourney: true,
  },
  {
    key: "e2e-permission-denial",
    domain: "Permission denial UI for non-admin",
    testFiles: [
      "tests/e2e/routes/system/permission-enforcement.spec.ts",
      "tests/e2e/routes/system/rbac.spec.ts",
    ],
    description: "Non-admin user sees permission denial UI / navigation restrictions",
    isApiDomain: false,
    isE2EJourney: true,
  },
  {
    key: "e2e-a11y-smoke",
    domain: "A11y smoke on login",
    testFiles: ["tests/e2e/routes/login/accessibility.spec.ts"],
    description: "Login page passes accessibility smoke test (keyboard nav, ARIA, contrast)",
    isApiDomain: false,
    isE2EJourney: true,
  },
];

// ---------------------------------------------------------------------------
// Combined manifest
// ---------------------------------------------------------------------------

export const CRITICAL_TEST_MANIFEST: CriticalTestEntry[] = [
  ...CRITICAL_API_DOMAINS,
  ...CRITICAL_E2E_JOURNEYS,
];

/** Count of critical API domains */
export const CRITICAL_API_DOMAIN_COUNT = CRITICAL_API_DOMAINS.length;

/** Count of critical E2E journeys */
export const CRITICAL_E2E_JOURNEY_COUNT = CRITICAL_E2E_JOURNEYS.length;

/** Total critical test items */
export const CRITICAL_TOTAL_COUNT = CRITICAL_TEST_MANIFEST.length;

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
 * Verify that all critical test manifest entries have their test files present
 * and contain an adequate number of test cases.
 *
 * @param options - Optional overrides
 * @param options.minTestsPerFile - Minimum tests per file (default: MIN_TESTS_PER_FILE)
 * @param options.projectRoot - Project root to resolve relative paths (default: process.cwd())
 * @returns A CriticalTestVerificationResult with any gaps found
 */
export function verifyCriticalTestCoverage(
  options: { minTestsPerFile?: number; projectRoot?: string } = {},
): CriticalTestVerificationResult {
  const minTests = options.minTestsPerFile ?? MIN_TESTS_PER_FILE;
  const root = options.projectRoot ?? process.cwd();

  const gaps: CriticalTestGap[] = [];
  const checkedFiles = new Set<string>();
  const existingFiles = new Set<string>();

  for (const entry of CRITICAL_TEST_MANIFEST) {
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
          message: `Critical test file missing: ${relativePath} (required by "${entry.domain}")`,
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
          message: `Critical test file is empty: ${relativePath} (required by "${entry.domain}")`,
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
          message: `Critical test file has only ${testCount} test(s), expected at least ${minTests}: ${relativePath} (required by "${entry.domain}")`,
        });
      }
    }
  }

  return {
    gaps,
    totalEntries: CRITICAL_TEST_MANIFEST.length,
    totalFiles: checkedFiles.size,
    filesFound: existingFiles.size,
    passed: gaps.length === 0,
  };
}

/**
 * Pretty-print verification results to the console.
 */
export function printCriticalTestVerification(result: CriticalTestVerificationResult): void {
  const status = result.passed ? "PASSED" : "FAILED";

  console.log(`\n📋 Critical Test Coverage Verification — ${status}`);
  console.log(
    `   ${result.totalEntries} manifest entries, ${result.totalFiles} test files checked`,
  );
  console.log(`   ${result.filesFound}/${result.totalFiles} files found on disk\n`);

  if (result.gaps.length === 0) {
    console.log("   ✅ All critical test files present and adequately populated.\n");
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
