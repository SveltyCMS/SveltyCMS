/**
 * @file .github/workflows/e2e-matrix.ts
 * @description
 * Generates a GitHub Actions matrix JSON for Playwright E2E test sharding.
 *
 * Simplified architecture (4 projects):
 *   wizard + firstuser + auth-setup → run sequentially in e2e-prep
 *   chromium → sharded N ways in the e2e CI job
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
}

interface E2eMatrix {
  project: string[];
  include: E2eMatrixInclude[];
}

// Single chromium project, sharded 6 ways for CI parallelism.
// Wizard, firstuser, and auth-setup run in e2e-prep (excluded here).
const TOTAL_SHARDS = 6;

const include: E2eMatrixInclude[] = [];
for (let i = 1; i <= TOTAL_SHARDS; i++) {
  include.push({
    project: "chromium",
    shard: `${i}/${TOTAL_SHARDS}`,
    shardId: `${i}-${TOTAL_SHARDS}`,
    "total-shards": TOTAL_SHARDS,
  });
}

const e2eMatrix: E2eMatrix = {
  project: ["chromium"],
  include,
};

// biome-ignore lint: top-level console for CI script output
console.log(JSON.stringify(e2eMatrix));
