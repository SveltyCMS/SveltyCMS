/**
 * @file .github/workflows/e2e-matrix.ts
 * @description
 * Generates a GitHub Actions matrix JSON for Playwright E2E test sharding.
 *
 * Defines project types for the sharded E2E job. Wizard and Auth projects
 * are run separately in e2e-prep (sequential, state-dependent), so they
 * are excluded from this matrix.
 *
 * Each entry has two shard representations:
 *   - shard:   "1/2" format for Playwright's --shard flag
 *   - shardId: "1-2" format for safe artifact names (no / in filenames)
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
  parallel: boolean;
}

interface E2eMatrix {
  project: string[];
  include: E2eMatrixInclude[];
}

// Wizard and Auth run in e2e-prep (state-dependent, must be sequential).
// Only chromium runs in the sharded parallel matrix.
const projectDefinitions: Array<{
  name: string;
  shards: number;
  parallel: boolean;
}> = [{ name: "chromium", shards: 2, parallel: true }];

const include: E2eMatrixInclude[] = [];

for (const def of projectDefinitions) {
  for (let i = 1; i <= def.shards; i++) {
    include.push({
      project: def.name,
      shard: `${i}/${def.shards}`,
      shardId: `${i}-${def.shards}`,
      "total-shards": def.shards,
      parallel: def.parallel,
    });
  }
}

const e2eMatrix: E2eMatrix = {
  project: projectDefinitions.map((d) => d.name),
  include,
};

// biome-ignore lint: top-level console for CI script output
console.log(JSON.stringify(e2eMatrix));
