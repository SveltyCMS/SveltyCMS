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
 *
 * Every chromium spec must match exactly ONE group. `tests/unit/ci/e2e-partition.test.ts`
 * fails the fast tier when a spec matches zero groups (silently never runs) or two
 * (runs twice). Add new specs to a group in the same commit.
 *
 * Groups are sized for a 3-minute shard budget: setup (~45 s) + boot (~3 s) leaves
 * ~100 s of test time, so a 14-spec group was split rather than left to drift.
 */
/**
 * Path separator as either slash form. Playwright's `--grep` runs against
 * `titlePath()`, whose first element is the spec path with the **OS** separator —
 * a pattern written with `/` only silently selects zero tests on Windows, and a
 * shard that selects nothing looks like a passing empty run locally.
 */
const S = "[\\\\/]";

export const SHARD_GROUPS: Array<{ name: string; grep: string }> = [
  {
    name: "Config & System",
    grep: `routes${S}config${S}(access-management|appearance|appearance-golden|automations|data-management|data-ops|design-system)\\.spec`,
  },
  {
    name: "Config — Ops & Extensions",
    grep: `routes${S}config${S}(extensions|operations|redirects|route-breadth|unified-hub|webhooks|workflows)\\.spec`,
  },
  {
    name: "Builder & Content",
    grep: `(routes${S}collection-builder${S}|content-smoke|empty-state|structure-persistence|federation|(^|${S})smoke\\.spec\\.ts)`,
  },
  {
    name: "Users & Profile",
    grep: `(routes${S}user${S}(account-smoke|profile|session-revocation|token-actions|management)|account-smoke|session-revocation|token-actions)`,
  },
  {
    name: "RBAC & Enforcement",
    grep: `(routes${S}system${S}(permissions|rbac|permission-enforcement)|rbac)`,
  },
  {
    name: "User Journeys",
    grep: `(routes${S}user${S}(coverage-100|p0-journeys|complete-coverage)|coverage-100|p0-journeys|complete-coverage)`,
  },
  {
    name: "Media & Dashboard",
    // `dashboard${S}(?!accessibility)` keeps the axe audit in Auth & Branding
    // (it is the a11y/contrast shard) instead of running it twice.
    grep: `(routes${S}mediagallery${S}|routes${S}dashboard${S}(?!accessibility\\.spec)|image-editor|mediagallery)`,
  },
  {
    name: "Auth & Branding",
    grep: `(routes${S}login${S}(branding|accessibility|extended-auth)|routes${S}admin-theme${S}|(^|${S})accessibility\\.spec\\.ts|branding|visual-regression|routes${S}system${S}language)`,
  },
  {
    name: "Admin & Catch-All",
    grep: `(routes${S}admin${S}|routes${S}system${S}settings|routes${S}system${S}hooks-lane-smoke|admin${S}tenants|catch-all|isolation|routes${S}site${S}|multi-tenancy|browser-vitality|(^|${S})layout-shift\\.spec\\.ts)`,
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
