/**
 * @file .github/workflows/e2e-matrix.ts
 * @description
 * Generates a GitHub Actions matrix JSON for Playwright E2E test sharding.
 *
 * Simplified architecture (4 projects):
 *   wizard + firstuser + auth-setup → run sequentially in e2e-prep
 *   chromium → sharded into N named groups for CI parallelism
 *
 * Each shard has a descriptive name so CI results clearly show which test
 * category failed instead of just "1/6", "2/6", etc.
 *
 * Usage:
 *   node .github/workflows/e2e-matrix.ts
 *   # Prints JSON to stdout, suitable for workflow matrix generation.
 */

interface E2eMatrixInclude {
  project: string;
  shard: string;
  shardId: string;
  "total-shards": number;
  name: string;
  grep: string;
}

interface E2eMatrix {
  name: string[];
  include: E2eMatrixInclude[];
}

// Named groups — each maps to specific test files via Playwright --grep.
// Groups are sized roughly by test count to balance shard duration.
const SHARD_GROUPS: Array<{ name: string; grep: string }> = [
  {
    name: "Config & System",
    // Include data-ops (sync/trash shell) by path/title; sync|trash alone can miss case-sensitive path matches
    grep: "(appearance|design-system|webhooks|operations|access-management|automations|data-management|data-ops|system-settings|monitor|queue|extensions|sync|trash|redirects)",
  },
  {
    name: "Builder & Content",
    grep: "(collection-builder|journey|empty-state|content-smoke)",
  },
  {
    // Paths + describe titles (Playwright --grep matches full title including file path)
    name: "Users & RBAC",
    grep: "(user/profile|user/management|user/account-smoke|permissions|rbac|account-smoke)",
  },
  {
    name: "Media & Dashboard",
    grep: "(mediagallery|image-editor|dashboard)",
  },
  {
    name: "Auth & Branding",
    grep: "(branding|visual-regression|accessibility|language)",
  },
  {
    // Prefer path/title anchors that won't accidentally scoop unrelated specs
    // (e.g. profile tests that merely contain the word "settings").
    name: "Admin & Catch-All",
    grep: "(admin/tenants|system/settings|system-settings|catch-all|isolation)",
  },
];

const include: E2eMatrixInclude[] = [];
const TOTAL = SHARD_GROUPS.length;

for (let i = 0; i < SHARD_GROUPS.length; i++) {
  const group = SHARD_GROUPS[i]!;
  const idx = i + 1;
  include.push({
    project: "chromium",
    shard: `${idx}/${TOTAL}`,
    shardId: `${idx}-${TOTAL}`,
    "total-shards": TOTAL,
    name: group.name,
    grep: group.grep,
  });
}

const e2eMatrix: E2eMatrix = {
  name: SHARD_GROUPS.map((g) => g.name),
  include,
};

// biome-ignore lint: top-level console for CI script output
console.log(JSON.stringify(e2eMatrix));
