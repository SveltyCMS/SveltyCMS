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
 * Named groups — Playwright's `--grep` matches the spec path (relative to
 * `testDir`, OS-separated) followed by every describe/test title.
 *
 * Two rules keep this a true partition:
 * 1. Anchor on the **path**, not on loose words — a title mentioning "dashboard"
 *    or "rbac" used to pull eleven specs into a second shard.
 * 2. Never match `/` only — Windows hands Playwright `routes\config\...`, so a
 *    slash-only pattern silently selects zero tests and the shard looks green.
 *
 * `tests/unit/ci/e2e-matrix-partition.test.ts` fails the fast tier when a spec
 * matches zero groups (silently never runs) or two (runs twice).
 *
 * Groups are sized for a 3-minute shard budget: setup (~45 s) + boot (~3 s) leaves
 * ~100 s of test time, so the 14-spec Config group was split rather than left to
 * drift.
 */
/** Path separator as either slash form. */
const S = "[\\\\/]";

/** Any run of characters inside a single path segment (no separator). */
const SEG = "[^\\\\/]*";

/** Start of the haystack or a space — top-level specs have no `routes/` prefix. */
const TOP = "(?:^|\\s)";

/** Files owned by the "Config — Ops & Extensions" shard (kept in one place so the
 * split stays a partition). New config specs fall into "Config & System" by
 * default instead of silently matching nothing. */
const CONFIG_OPS = "extensions|operations|redirects|route-breadth|unified-hub|webhooks|workflows";

export const SHARD_GROUPS: Array<{ name: string; grep: string }> = [
  {
    name: "Config & System",
    grep: `routes${S}config${S}(?!${SEG}(${CONFIG_OPS})\\.spec)`,
  },
  {
    name: "Config — Ops & Extensions",
    grep: `routes${S}config${S}${SEG}(${CONFIG_OPS})\\.spec`,
  },
  {
    name: "Builder & Content",
    grep: `(routes${S}collection-builder${S}|${TOP}smoke\\.spec\\.ts)`,
  },
  {
    name: "Users & Profile",
    grep: `routes${S}user${S}(account-smoke|profile|session-revocation|token-actions|management)${SEG}\\.spec`,
  },
  {
    name: "RBAC & Enforcement",
    grep: `routes${S}system${S}(permissions|rbac|permission-enforcement)\\.spec`,
  },
  {
    name: "User Journeys",
    grep: `routes${S}user${S}(coverage-100|p0-journeys|complete-coverage)\\.spec`,
  },
  {
    name: "Media & Dashboard",
    // The dashboard axe audit belongs to Auth & Branding (the a11y shard).
    grep: `routes${S}(mediagallery${S}|dashboard${S}(?!accessibility\\.spec))`,
  },
  {
    name: "Auth & Branding",
    grep: `(${TOP}accessibility\\.spec\\.ts|routes${S}dashboard${S}accessibility\\.spec\\.ts|routes${S}login${S}(branding|accessibility|extended-auth)\\.spec|routes${S}admin-theme${S}|routes${S}system${S}language\\.spec)`,
  },
  {
    name: "Admin & Catch-All",
    grep: `(${TOP}(browser-vitality|layout-shift)\\.spec|multi-tenancy${S}|routes${S}admin${S}|routes${S}site${S}|routes${S}system${S}(settings|hooks-lane-smoke)\\.spec)`,
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
