/**
 * @file .github/workflows/e2e-matrix.ts
 * @description
 * Generates a GitHub Actions matrix JSON for Playwright E2E test projects.
 *
 * Each Playwright project gets its own CI job so test results are visible
 * per-project (not collapsed into a single "chromium" catch-all).
 *
 * Wizard, firstuser, and auth-setup run in e2e-prep (state-dependent,
 * sequential). They are excluded from this matrix.
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

// Projects from playwright.config.ts that run in the parallel E2E matrix.
// Wizard, firstuser, and auth-setup run in e2e-prep (excluded here).
const projectDefinitions: Array<{ name: string; shards: number }> = [
  { name: "signup", shards: 1 },
  { name: "content", shards: 1 },
  { name: "system", shards: 1 },
  { name: "a11y", shards: 1 },
  { name: "branding", shards: 1 },
  { name: "visual-regression", shards: 1 },
  { name: "rbac", shards: 1 },
  { name: "language", shards: 1 },
  { name: "users", shards: 1 },
  { name: "builder", shards: 2 },
  { name: "permissions", shards: 1 },
  { name: "config-routes", shards: 1 },
  { name: "admin", shards: 1 },
  { name: "dashboard", shards: 1 },
  { name: "appearance", shards: 1 },
  { name: "media", shards: 1 },
  { name: "chromium", shards: 1 },
];

const include: E2eMatrixInclude[] = [];

for (const def of projectDefinitions) {
  for (let i = 1; i <= def.shards; i++) {
    include.push({
      project: def.name,
      shard: def.shards > 1 ? `${i}/${def.shards}` : "1/1",
      shardId: `${i}-${def.shards}`,
      "total-shards": def.shards,
    });
  }
}

const e2eMatrix: E2eMatrix = {
  project: projectDefinitions.map((d) => d.name),
  include,
};

// biome-ignore lint: top-level console for CI script output
console.log(JSON.stringify(e2eMatrix));
