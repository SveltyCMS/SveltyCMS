/**
 * @file scripts/quality-gate.ts
 * @description Fast, incremental pre-commit quality gate.
 *
 *  This script performs a series of automated checks on staged files before allowing a commit.
 */

import { spawnSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { relative, join } from "node:path";

const ROOT = process.cwd();

interface Task {
  name: string;
  run: () => Promise<boolean> | boolean;
  skip?: boolean | (() => boolean);
}

function runCommand(
  cmd: string,
  args: string[] = [],
  options: { silent?: boolean; env?: Record<string, string> } = {},
): boolean {
  console.log(`   $ ${cmd} ${args.join(" ")}`);

  const result = spawnSync(cmd, args, {
    stdio: options.silent ? "pipe" : "inherit",
    shell: true,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    cwd: ROOT,
  });

  return result.status === 0;
}

function getStagedFiles(): string[] {
  try {
    return execSync("git diff --cached --name-only --diff-filter=ACMR", {
      encoding: "utf8",
      cwd: ROOT,
    })
      .trim()
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function main() {
  console.log("⚡ Running Quality Gate...\n");

  const stagedFiles = getStagedFiles();

  if (stagedFiles.length === 0) {
    console.log("⏩ No staged changes. Skipping quality gate.");
    process.exit(0);
  }

  console.log(`🔎 Staged files: ${stagedFiles.length}`);
  if (stagedFiles.length <= 12) {
    console.log(`   ${stagedFiles.map((f) => relative(ROOT, f)).join(", ")}`);
  }

  // Change detection using startsWith for precision
  const hasTsOrSvelte = stagedFiles.some((f) => /\.(ts|js|svelte)$/.test(f));
  const changedPaths = {
    database: stagedFiles.some((f) => f.startsWith("src/databases/")),
    api: stagedFiles.some((f) => f.startsWith("src/routes/api/")),
    services: stagedFiles.some((f) => f.startsWith("src/services/")),
    config: stagedFiles.some((f) => f.startsWith("config/")),
    integrationTests: stagedFiles.some((f) => f.startsWith("tests/integration/")),
    scripts: stagedFiles.some((f) => f.startsWith("scripts/")),
  };

  const shouldRunIntegration = Object.values(changedPaths).some(Boolean);
  const buildExists = existsSync(join(ROOT, "build/index.js"));

  // Tasks — sequential for clear output
  const tasks: Task[] = [
    {
      name: "Format",
      run: () => runCommand("vp", ["fmt", "--config", ".oxfmtrc.json"]),
    },
    {
      name: "Slop Scanner",
      skip: () => {
        const svelteTsFiles = stagedFiles.filter((f) => /\.(svelte|ts)$/.test(f));
        return svelteTsFiles.length === 0;
      },
      run: () => {
        const svelteTsFiles = stagedFiles.filter((f) => /\.(svelte|ts)$/.test(f));
        return runCommand("bun", [
          "run",
          "scripts/slop-scanner.ts",
          "--strict",
          "--files",
          ...svelteTsFiles,
        ]);
      },
    },
    {
      name: "Lint",
      run: () => runCommand("vp", ["lint"]),
    },
    {
      name: "Type Check",
      skip: !hasTsOrSvelte,
      run: () => runCommand("bun", ["run", "check"]),
    },
    {
      name: "Smart Test Orchestrator",
      skip: !hasTsOrSvelte,
      run: () => runCommand("bun", ["run", "scripts/test-smart.ts"]),
    },
    {
      name: "Dependency Audit",
      run: async () => {
        console.log("   (non-blocking — CI enforces this)");
        const ok = runCommand("bun", ["audit", "--level", "critical"], {
          silent: true,
        });
        if (!ok) {
          console.warn("   ⚠️  Critical vulnerabilities detected (CI will block PR)");
        }
        return true;
      },
    },
    {
      name: "Production Build",
      skip: !hasTsOrSvelte,
      run: () =>
        runCommand("bun", ["run", "build"], {
          env: { COMPILE_ALL_ADAPTERS: "true" },
        }),
    },
    {
      name: "Integration Tests (SQLite)",
      skip: !shouldRunIntegration || process.env.PRE_COMMIT === "true",
      run: async () => {
        if (!buildExists) {
          console.warn("   ⚠️  Build missing — skipping integration tests");
          return true;
        }
        return runCommand("bun", [
          "run",
          "scripts/run-integration-tests.ts",
          "--filter=sqlite",
          "--no-build",
        ]);
      },
    },
  ];

  console.log(`\n🚦 Running ${tasks.filter((t) => !t.skip).length} quality checks...\n`);

  for (const task of tasks) {
    const shouldSkip = typeof task.skip === "function" ? task.skip() : task.skip;
    if (shouldSkip) continue;

    console.log(`▶️  ${task.name}`);

    let success = false;
    try {
      const result = task.run();
      success = result instanceof Promise ? await result : result;
    } catch (err) {
      console.error(`\n❌ ${task.name} crashed:`, err);
      process.exit(1);
    }

    if (!success) {
      console.error(`\n❌ ${task.name} failed. Fix the issues above before committing.`);
      process.exit(1);
    }

    console.log(`✅ ${task.name} passed\n`);
  }

  console.log("✨ All quality gates passed. Commit allowed.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Quality gate crashed:", err);
  process.exit(1);
});
