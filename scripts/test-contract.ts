#!/usr/bin/env bun
/**
 * @file scripts/test-contract.ts
 * @description Single "test quality contract" scorecard. Runs the three gates that
 * verify tests actually prove their claims, and reports them in one place.
 *
 * Gates:
 *   1. Route coverage   — every admin `(app)` route group has a test at some layer
 *   2. Critical P0      — every P0 API domain / E2E journey test file exists & is populated
 *   3. Seam assertions  — mutation tests assert persistence, unit tests assert failure paths
 *
 * Usage:
 *   bun run test:contract
 *   bun run test:contract --scan   # also sweep E2E for toast-only mutation specs
 *
 * Exit: 0 when all three gates pass, 1 otherwise. Each individual gate remains
 * wired into `bun run check` / `bun run test:unit`; this is the aggregate view.
 */

import { resolve } from "node:path";
import { verifyAppRouteCoverage } from "../tests/route-test-coverage";
import { verifyCriticalTestCoverage } from "../tests/critical-test-paths";
import { checkSeamAssertions } from "./check-seam-assertions";

const ROOT = resolve(import.meta.dirname, "..");
const SCAN = process.argv.includes("--scan");

const routes = verifyAppRouteCoverage({ projectRoot: ROOT });
const critical = verifyCriticalTestCoverage({ projectRoot: ROOT });
const seams = checkSeamAssertions({ rootDir: ROOT, scan: SCAN });

console.log("\n═══ Test Quality Contract ═══\n");

console.log(
  `1. Route coverage  ${routes.passed ? "✅" : "❌"}  ${routes.totalRoutes} route group(s) tracked`,
);
for (const gap of routes.gaps) {
  console.log(`   - [${gap.type}] ${gap.route}${gap.filePath ? ` → ${gap.filePath}` : ""}`);
}

console.log(
  `2. Critical P0     ${critical.passed ? "✅" : "❌"}  ${critical.totalEntries} manifest entry/entries, ${critical.filesFound}/${critical.totalFiles} file(s) found`,
);
for (const gap of critical.gaps) {
  console.log(`   - [${gap.type}] ${gap.filePath} (${gap.domain})`);
}

const seamPassed = seams.results.filter((r) => r.pass).length;
console.log(
  `3. Seam assertions ${seams.ok ? "✅" : "❌"}  ${seamPassed}/${seams.results.length} seam-critical file(s)`,
);
for (const r of seams.results.filter((r) => !r.pass)) {
  console.log(`   - ${r.file} (${r.kind}) missing ${r.required}`);
}
for (const warning of seams.warnings) {
  console.log(`   ⚠ ${warning}`);
}

const ok = routes.passed && critical.passed && seams.ok;
console.log(`\n${ok ? "✅ All contract gates pass" : "❌ Contract gate(s) failed"}\n`);

process.exit(ok ? 0 : 1);
