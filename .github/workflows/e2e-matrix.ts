/**
 * @file .github/workflows/e2e-matrix.ts
 * @description
 * Generates a GitHub Actions matrix JSON for Playwright E2E test sharding.
 *
 * Defines three project types:
 * - "chromium": split across 2 shards for parallel execution.
 * - "Wizard": single shard, no parallelism (setup wizard requires sequential
 *   execution).
 * - "Auth": single shard, no parallelism (authentication state setup must
 *   run sequentially).
 *
 * Usage:
 *   bun run .github/workflows/e2e-matrix.ts
 *   # Prints JSON to stdout, suitable for workflow matrix generation.
 */

interface E2eMatrixInclude {
  project: string;
  shard: string;
  "total-shards": number;
  parallel: boolean;
}

interface E2eMatrix {
  project: string[];
  include: E2eMatrixInclude[];
}

const projectDefinitions: Array<{
  name: string;
  shards: number;
  parallel: boolean;
}> = [
  { name: "chromium", shards: 2, parallel: true },
  { name: "Wizard", shards: 1, parallel: false },
  { name: "Auth", shards: 1, parallel: false },
];

const include: E2eMatrixInclude[] = [];

for (const def of projectDefinitions) {
  for (let i = 1; i <= def.shards; i++) {
    include.push({
      project: def.name,
      shard: `${i}/${def.shards}`,
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
