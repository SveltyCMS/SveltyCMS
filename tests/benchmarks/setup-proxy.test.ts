/**
 * @file tests/benchmarks/setup-proxy.test.ts
 * @description Proxy test to run setup-benchmarks.ts within the Bun test environment.
 * This guarantees that SvelteKit virtual modules (like $app/environment) are properly mocked via bun-preload.ts.
 */

import { test } from "bun:test";
import { main } from "../../scripts/benchmark-matrix/setup-benchmarks";

test("Relational Seeding Setup", async () => {
  console.log("🚀 Launching Relational Seeding via Proxy Test...");
  await main();
}, 240000); // 4 minute timeout for heavy seeding
