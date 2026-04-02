/**
 * @file scripts/run-bun-tests.ts
 * @description Isolated test runner for Bun leveraging native Bun APIs.
 */

import { Glob } from "bun";

async function run() {
  console.log("\x1b[36m🧪 Running Bun Unit Tests in Isolated Mode...\x1b[0m");

  // 1. Use native Bun.Glob instead of npm 'glob'
  const glob = new Glob("tests/unit/**/*.test.ts");
  const allFiles = Array.from(glob.scanSync("."));
  const files = [];

  for (const file of allFiles) {
    if (file.includes("sample")) continue;
    const content = await Bun.file(file).text();
    if (content.includes('from "vitest"')) {
      // console.log(`⏩ Skipping Vitest test: ${file}`);
      continue;
    }
    files.push(file);
  }
  files.sort();

  let totalPassed = 0;
  const failedFiles: string[] = [];

  for (const file of files) {
    console.log(`
---------------------------------------------------------`);
    console.log(`📂 Testing ${file}`);
    console.log(`---------------------------------------------------------`);

    // 2. Use native Bun.spawnSync instead of node:child_process
    const proc = Bun.spawnSync(
      [
        "bun",
        "test",
        "--preload",
        "./tests/unit/global-setup.ts",
        "--preload",
        "./tests/unit/bun-preload.ts",
        "--preload",
        "./tests/unit/setup.ts",
        "--timeout",
        "20000",
        file,
      ],
      {
        stdio: ["inherit", "inherit", "inherit"],
      },
    );

    // Bun's spawnSync returns a convenient boolean for success
    if (proc.success) {
      totalPassed++;
    } else {
      failedFiles.push(file);
    }
  }

  const totalFailed = failedFiles.length;

  // 3. Add terminal colors for better DX
  console.log(`

=========================================================`);
  console.log(`📊 Bun Test Summary:`);
  console.log(`\x1b[32m✅ Passed: ${totalPassed}\x1b[0m`);

  if (totalFailed > 0) {
    console.log(`\x1b[31m❌ Failed: ${totalFailed}\x1b[0m
`);
    console.log(`Failed Files:`);
    failedFiles.forEach((f) => console.log(`  - ${f}`));
    console.log(`=========================================================`);
    process.exit(1);
  } else {
    console.log(`\x1b[32m❌ Failed: 0\x1b[0m`);
    console.log(`=========================================================`);
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("\x1b[31mTest runner failed:\x1b[0m", err);
  process.exit(1);
});
