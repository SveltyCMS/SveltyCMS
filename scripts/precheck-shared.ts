/**
 * @file scripts/precheck-shared.ts
 * @description
 * Shared utilities and CI-parity task manifest for local precheck runners.
 *
 * Single source of truth for what runs locally vs GitHub Actions ci.yml:
 *   push tier → pre-push hook (static analysis, unit, build, 4-DB integration, benchmarks)
 *   full tier → ci:local without E2E (everything in push + optional E2E in ci-local.ts)
 *
 * ### Features:
 * - change-aware task skipping for push tier
 * - Docker reachability probes for network DB adapters
 * - canonical env blocks from test-db-credentials.ts
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  getDefaultDbPort,
  getBenchmarkTestEnv,
  getIntegrationTestEnv,
  INTEGRATION_DB_MATRIX,
  type IntegrationDbType,
} from "../src/utils/test-db-credentials.ts";

export const ROOT = process.cwd();
export const IS_WINDOWS = process.platform === "win32";

export type PrecheckTier = "push" | "full";

export interface Task {
  name: string;
  skip?: boolean | (() => boolean);
  run: () => boolean | Promise<boolean>;
  ciJob?: string;
  timeout?: number;
}

export interface ChangeProfile {
  paths: string[];
  hasSourceCode: boolean;
  hasInfra: boolean;
  hasDbInfra: boolean;
  hasAdminTheme: boolean;
  hasDocs: boolean;
  /** True when build + integration + benchmarks should run before push. */
  needsCiSmoke: boolean;
}

export interface PrecheckOptions {
  tier: PrecheckTier;
  /** Push tier only — omit to auto-detect from git. */
  changedPaths?: string[];
  skipBenchmarks?: boolean;
  /** Full tier only — run a single adapter instead of the 4-DB matrix. */
  singleDb?: IntegrationDbType;
}

export function runCommand(
  cmd: string,
  args: string[] = [],
  options: {
    silent?: boolean;
    env?: Record<string, string>;
    timeout?: number;
  } = {},
): boolean {
  console.log(`   $ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    stdio: options.silent ? "pipe" : "inherit",
    shell: IS_WINDOWS,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    cwd: ROOT,
    timeout: options.timeout ?? 300_000,
  });

  if (result.status !== 0) {
    if (result.error) {
      console.error(`   Command failed to start: ${result.error.message}`);
    } else if (result.signal) {
      console.error(`   Command killed by signal: ${result.signal}`);
    }
    return false;
  }
  return true;
}

function gitOutput(args: string[]): string {
  try {
    const result = spawnSync("git", args, {
      encoding: "utf8",
      cwd: ROOT,
      stdio: ["ignore", "pipe", "ignore"],
      shell: IS_WINDOWS,
    });
    return result.stdout || "";
  } catch {
    return "";
  }
}

export function getChangedPaths(): string[] {
  const output =
    gitOutput(["diff", "--name-only", "@{u}..HEAD"]) ||
    gitOutput(["diff", "--name-only", "HEAD~1..HEAD"]);
  return output
    .split("\n")
    .map((f) => f.trim().replace(/\\/g, "/"))
    .filter(Boolean);
}

export function analyzeChanges(paths: string[]): ChangeProfile {
  const hasSourceCode = paths.some(
    (f) => f.startsWith("src/") || f.startsWith("tests/") || /\.(ts|js|svelte)$/.test(f),
  );

  const hasInfra = paths.some(
    (f) =>
      f.startsWith(".github/") ||
      f.startsWith("scripts/") ||
      f === "package.json" ||
      f === "bun.lock" ||
      f.startsWith("vite.config") ||
      f.startsWith("svelte.config") ||
      f.startsWith("playwright.config"),
  );

  const hasDbInfra = paths.some(
    (f) =>
      f.includes("docker-compose") ||
      f.includes("db-matrix") ||
      f.includes("test-db-credentials") ||
      f.includes("run-integration-tests") ||
      f.includes("run-core-benchmarks") ||
      f.startsWith("src/databases/"),
  );

  const hasAdminTheme = paths.some(
    (f) => f.startsWith("src/routes/(app)/") && f.endsWith(".svelte"),
  );

  const hasDocs = paths.some((f) => f.startsWith("docs/") && /\.(md|mdx)$/.test(f));

  const needsCiSmoke = hasSourceCode || hasInfra || hasDbInfra;

  return {
    paths,
    hasSourceCode,
    hasInfra,
    hasDbInfra,
    hasAdminTheme,
    hasDocs,
    needsCiSmoke,
  };
}

export function hasUnstagedChanges(): boolean {
  // Exclude auto-generated benchmark reports (see AGENTS.md — underscore naming is intentional,
  // files are written by scripts/benchmark-matrix/generate-benchmark-reports.ts during CI/gate runs).
  const result = spawnSync(
    "git",
    ["diff", "--quiet", "--", ".", ":(exclude)docs/project/benchmarks/"],
    { cwd: ROOT, stdio: "pipe", shell: IS_WINDOWS },
  );
  return result.status !== 0;
}

export function checkNetworkDbReachable(db: IntegrationDbType): boolean {
  if (db === "sqlite") return true;
  const port = getDefaultDbPort(db);
  if (!port) return true;

  const probe = spawnSync(
    IS_WINDOWS ? "powershell" : "bash",
    IS_WINDOWS
      ? [
          "-Command",
          `Test-NetConnection -ComputerName 127.0.0.1 -Port ${port} -WarningAction SilentlyContinue | Select-Object -ExpandProperty TcpTestSucceeded`,
        ]
      : ["-c", `nc -z 127.0.0.1 ${port} 2>/dev/null`],
    { stdio: "pipe", encoding: "utf8", timeout: 10_000 },
  );

  if (IS_WINDOWS) {
    return probe.stdout?.trim().toLowerCase() === "true";
  }
  return probe.status === 0;
}

export function ensureTestSecret(): string {
  const secretPath = join(ROOT, "tests", "e2e", ".auth", "test-secret.txt");
  const authDir = join(ROOT, "tests", "e2e", ".auth");
  if (!existsSync(authDir)) mkdirSync(authDir, { recursive: true });

  if (process.env.TEST_API_SECRET) return process.env.TEST_API_SECRET;
  if (existsSync(secretPath)) return readFileSync(secretPath, "utf8").trim();

  const secret = `SVELTYCMS_PRECHECK_${Date.now()}_${randomUUID().slice(0, 8)}`;
  writeFileSync(secretPath, secret);
  return secret;
}

function integrationDatabases(singleDb?: IntegrationDbType): IntegrationDbType[] {
  if (singleDb) return [singleDb];
  return [...INTEGRATION_DB_MATRIX];
}

function shouldSkipStaticScan(tier: PrecheckTier, profile: ChangeProfile): boolean {
  if (tier === "full") return false;
  return !profile.hasSourceCode && !profile.hasInfra;
}

function shouldRunCiSmoke(tier: PrecheckTier, profile: ChangeProfile): boolean {
  if (tier === "full") return true;
  return profile.needsCiSmoke;
}

function shouldRunDependencyAudit(tier: PrecheckTier, profile: ChangeProfile): boolean {
  if (tier === "full") return true;
  return profile.paths.some((f) => f === "package.json" || f === "bun.lock");
}

/** Build the ordered task list for a precheck run. */
export function buildPrecheckTasks(
  tier: PrecheckTier,
  profile: ChangeProfile,
  testSecret: string,
  options: Pick<PrecheckOptions, "skipBenchmarks" | "singleDb"> = {},
): Task[] {
  const runSmoke = shouldRunCiSmoke(tier, profile);
  const skipStatic = (() => shouldSkipStaticScan(tier, profile))();
  const databases = integrationDatabases(options.singleDb);

  const tasks: Task[] = [
    {
      name: "Test Config Safety",
      run: () => runCommand("bun", ["run", "scripts/check-test-db-safety.ts"]),
    },
    {
      name: "Format Verification",
      ciJob: "format",
      run: () => runCommand("bun", ["run", "format"]),
    },
    {
      name: "Post-Format Tree Clean Check",
      ciJob: "format",
      run: () => {
        if (hasUnstagedChanges()) {
          console.error("\n❌ Working tree is dirty after formatting.");
          console.error("   Run 'bun run format' locally, commit the fixes, and retry.");
          return false;
        }
        return true;
      },
    },
    {
      name: "Slop Scanner",
      ciJob: "lint",
      skip: () => skipStatic,
      run: () => runCommand("bun", ["run", "scripts/slop-scanner.ts"]),
    },
    {
      name: "Import Validation",
      ciJob: "lint",
      skip: () => skipStatic,
      run: () => runCommand("bun", ["run", "scripts/validate-imports.ts"]),
    },
    {
      name: "Lint (oxlint)",
      ciJob: "lint",
      run: () => runCommand("bun", ["run", "lint"]),
    },
    {
      name: "Admin Theme Lint",
      ciJob: "lint",
      skip: () => tier === "push" && !profile.hasAdminTheme,
      run: () => runCommand("bun", ["run", "lint:admin-theme"]),
    },
    {
      name: "Docs Lint",
      ciJob: "docs-lint",
      skip: () => tier === "push" && !profile.hasDocs,
      run: () => runCommand("bun", ["run", "lint:docs"]),
    },
    {
      name: "Benchmark MDX Lint",
      ciJob: "docs-lint",
      skip: () => tier === "push" && !profile.hasDocs,
      run: () => runCommand("bun", ["run", "lint:benchmark-mdx"]),
    },
    {
      name: "Dependency Audit (high CVE)",
      ciJob: "security-audit",
      skip: () => !shouldRunDependencyAudit(tier, profile),
      run: () =>
        runCommand("bun", ["audit", "--severity=high"], {
          timeout: 120_000,
        }),
    },
    {
      name: "Format + Lint Check",
      ciJob: "check",
      skip: () => skipStatic,
      run: () => runCommand("bun", ["run", "check"]),
    },
    {
      name: "Full Unit Tests",
      ciJob: "unit",
      run: () => runCommand("bun", ["run", "test:unit"], { timeout: 600_000 }),
    },
    {
      name: "Production Build",
      ciJob: "build",
      skip: () => !runSmoke,
      run: () =>
        runCommand("bun", ["run", "build"], {
          env: { COMPILE_ALL_ADAPTERS: "true" },
          timeout: 600_000,
        }),
    },
    ...databases.flatMap((db) => [
      {
        name: `Integration (${db})`,
        ciJob: `db-tests (${db})`,
        skip: true, // DB matrix runs in CI only (ci:local / verify:full)
        run: () => {
          if (db !== "sqlite" && !checkNetworkDbReachable(db)) {
            const port = getDefaultDbPort(db);
            console.error(`\n❌ ${db} is not reachable at 127.0.0.1:${port}.`);
            console.error(
              `   Start Docker: docker compose -f tests/docker-compose.yml --profile ${db} up -d`,
            );
            return false;
          }

          const timeout = db === "mongodb" || db === "mariadb" ? 900_000 : 600_000;
          return runCommand(
            "bun",
            ["run", "scripts/run-integration-tests.ts", `--db=${db}`, "--no-build"],
            {
              env: {
                ...getIntegrationTestEnv(db),
                TEST_API_SECRET: testSecret,
                ADMIN_PASSWORD: "Password123!",
              },
              timeout,
            },
          );
        },
      } satisfies Task,
      {
        name: `Benchmarks (${db})`,
        ciJob: `bench-core (${db})`,
        skip: true, // Benchmarks run in CI only (ci:local / verify:full)
        run: () => {
          if (db !== "sqlite" && !checkNetworkDbReachable(db)) {
            const port = getDefaultDbPort(db);
            console.error(`\n❌ ${db} is not reachable at 127.0.0.1:${port}.`);
            console.error(
              `   Start Docker: docker compose -f tests/docker-compose.yml --profile ${db} up -d`,
            );
            return false;
          }

          const timeout = db === "mongodb" || db === "mariadb" ? 900_000 : 600_000;
          return runCommand("bun", ["run", "scripts/run-core-benchmarks.ts", `--db=${db}`], {
            env: getBenchmarkTestEnv(db, { TEST_API_SECRET: testSecret }),
            timeout,
          });
        },
      } satisfies Task,
    ]),
  ];

  return tasks;
}

export function resolveActiveTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => {
    if (typeof t.skip === "function") return !t.skip();
    return !t.skip;
  });
}
