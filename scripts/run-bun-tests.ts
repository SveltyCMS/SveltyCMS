/**
 * @file scripts/run-bun-tests.ts
 * @description
 * Ultra-fast test runner for Bun.
 * Automatically discovers all .test.ts files and runs them in isolation.
 */

import { glob } from "glob";

async function main() {
  console.log("\n🚀 SveltyCMS High-Performance Test Runner (Bun)");
  console.log("=========================================================");

  // 1. Discover all tests
  const files = await glob("tests/**/*.test.ts");
  const filtered = files.filter((f) => !f.includes("e2e") && !f.includes("integration"));

  console.log(`🔍 Found ${filtered.length} tests. Starting execution...\n`);

  let totalPassed = 0;
  let failedFiles: string[] = [];

  for (const file of filtered) {
    console.log(`---------------------------------------------------------`);
    console.log(`📂 Testing ${file}`);
    console.log(`---------------------------------------------------------`);

    // 2. Use native Bun.spawnSync
    const proc = Bun.spawnSync(
      ["bun", "test", "--preload", "./tests/unit/bun-preload.ts", "--timeout", "20000", file],
      {
        stdio: ["inherit", "inherit", "inherit"],
      },
    );

    if (proc.success) {
      totalPassed++;
    } else {
      failedFiles.push(file);
    }
  }

  // 3. Reporting
  console.log("\n=========================================================");
  console.log(`📊 FINAL REPORT`);
  console.log("---------------------------------------------------------");
  console.log(`✅ Passed: ${totalPassed}/${filtered.length}`);
  if (failedFiles.length > 0) {
    console.log(`❌ Failed: ${failedFiles.length}`);
    console.log("\nFailed files:");
    failedFiles.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log(`🎉 All tests passed!`);
    process.exit(0);
  }
}

main().catch(console.error);
