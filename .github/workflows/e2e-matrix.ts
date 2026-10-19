/**
 * @file .github/workflows/e2e-matrix.ts
 * @description
 * Generates a GitHub Actions matrix JSON for Playwright E2E test sharding.
 *
 * Architecture:
 *   wizard + firstuser + auth-setup → sequential in e2e-prep
 *   chromium → parallel named groups partitioned by --grep only
 *
 * IMPORTANT: Each group uses shard=1/1. Grep already partitions the suite.
 * Combining --grep with --shard=N/M drops ~(M-1)/M of each group's tests
 * (and empty shards fail), which made CI look "elementary" and flaky.
 *
 * Groups must form a partition: every chromium spec matches exactly one grep,
 * otherwise it silently never runs. When splitting a group, split its regex
 * into two disjoint expressions instead of adding a second broad match.
 *
 * Usage:
 *   node .github/workflows/e2e-matrix.ts
 */

interface E2eMatrixInclude {
  project: string;
  shard: string;
  shardId: string;
  "total-shards": number;
  workers: number;
  name: string;
  grep: string;
}

interface E2eMatrix {
  name: string[];
  include: E2eMatrixInclude[];
}

/**
 * Named groups — Playwright --grep matches file path + title.
 * Keep anchors path-based so unrelated specs (e.g. "journey" in user/p0) don't leak.
 */
export const SHARD_GROUPS: Array<{ name: string; grep: string }> = [
  {
    name: "Config & System",
    grep: "(routes/config/|config/|operations|system-settings|monitor|queue|extensions|unified-hub|workflows)",
  },
  {
    name: "Builder & Content",
    grep: "(routes/collection-builder/|content-smoke|empty-state|structure-persistence|federation)",
  },
  {
    name: "Users & Profile",
    grep: "(routes[\\\\/]user[\\\\/](account-smoke|profile|session-revocation|token-actions|management)|account-smoke|session-revocation|token-actions)",
  },
  {
    name: "RBAC & Enforcement",
    grep: "(routes[\\\\/]system[\\\\/](permissions|rbac|permission-enforcement)|rbac)",
  },
  {
    name: "User Journeys",
    grep: "(routes[\\\\/]user[\\\\/](coverage-100|p0-journeys|complete-coverage)|coverage-100|p0-journeys|complete-coverage)",
  },
  {
    name: "Media & Dashboard",
    grep: "(routes/mediagallery/|routes/dashboard/|image-editor|mediagallery|dashboard)",
  },
  {
    name: "Auth & Branding",
    grep: "(routes/login/branding|routes/login/accessibility|routes/login/extended-auth|routes/admin-theme/|accessibility\\.spec|branding|visual-regression|routes/system/language)",
  },
  {
    name: "Admin & Catch-All",
    grep: "(routes/admin/|routes/system/settings|routes/system/hooks-lane-smoke|admin/tenants|catch-all|isolation|routes/site/|multi-tenancy)",
  },
];

const include: E2eMatrixInclude[] = [];
const TOTAL = SHARD_GROUPS.length;

for (let i = 0; i < SHARD_GROUPS.length; i++) {
  const group = SHARD_GROUPS[i]!;
  // Grep partitions the suite — always run the full matching set (1/1).
  include.push({
    project: "chromium",
    shard: "1/1",
    shardId: `${i + 1}-${TOTAL}`,
    "total-shards": 1,
    workers: 1,
    name: group.name,
    grep: group.grep,
  });
}

const e2eMatrix: E2eMatrix = {
  name: SHARD_GROUPS.map((g) => g.name),
  include,
};

// biome-ignore lint: top-level console for CI script output
// Print only when executed as the matrix generator; unit tests import
// SHARD_GROUPS and must not emit a matrix JSON into their output.
const isEntrypoint = process.argv[1]
  ?.replaceAll("\\", "/")
  .endsWith(".github/workflows/e2e-matrix.ts");
if (isEntrypoint) console.log(JSON.stringify(e2eMatrix));
