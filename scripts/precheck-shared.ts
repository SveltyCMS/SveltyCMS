/**
 * @file scripts/precheck-shared.ts
 * @description
 * Shared utilities and CI-parity task manifest for local precheck runners.
 *
 * Single source of truth for what runs locally vs GitHub Actions ci.yml:
 *   push tier → pre-push hook (static analysis, unit, build)
 *   full tier → optional manual run with DB matrix + benchmarks
 *
 * DB integration and benchmarks are opt-in on push tier via `includeDbTasks`
 * (default: false for push, true for full). CI runs them in separate jobs.
 *
 * ### Features:
 * - declarative task registry (BASE_TASKS + createDbTasks)
 * - context-driven skip/include rules via RunContext
 * - change-aware task skipping for push tier
 * - Docker reachability probes for network DB adapters
 * - canonical env blocks from test-db-credentials.ts
 * - `getPrecheckPlan()` for debugging task selection before execution
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

// ---------------------------------------------------------------------------
// Core interfaces
// ---------------------------------------------------------------------------

export interface Task {
  name: string;
  skip?: boolean | (() => boolean);
  run: () => boolean | Promise<boolean>;
  ciJob?: string;
  timeout?: number;
  /** Estimated duration in ms for ETA calculation */
  estimatedMs?: number;
  /** Command to run locally to fix this task if it fails */
  remediation?: string;
  /**
   * When false, failure is reported but does not fail the run.
   * Mirrors ci.yml `bench-green` (bench-core is non-blocking for all-green).
   */
  blocking?: boolean;
}

export interface ChangeProfile {
  paths: string[];
  hasSourceCode: boolean;
  hasInfra: boolean;
  hasDbInfra: boolean;
  hasAdminTheme: boolean;
  hasDocs: boolean;
  /** True when build should run before push. */
  needsCiSmoke: boolean;
}

export interface PrecheckOptions {
  tier: PrecheckTier;
  /** Push tier only — omit to auto-detect from git. */
  changedPaths?: string[];
  skipBenchmarks?: boolean;
  /** Full tier only — run a single adapter instead of the 4-DB matrix. */
  singleDb?: IntegrationDbType;
  /**
   * Run integration tests + benchmarks locally.
   * Default: false for "push" (keeps pre-push fast), true for "full".
   */
  includeDbTasks?: boolean;
}

// ---------------------------------------------------------------------------
// Declarative task system
// ---------------------------------------------------------------------------

/** Context passed to every task spec's skip/include/run functions. */
export interface RunContext {
  tier: PrecheckTier;
  profile: ChangeProfile;
  testSecret: string;
  options: PrecheckOptions;
}

/**
 * A declarative task specification.
 * - `shouldInclude`: return false to exclude this task entirely.
 * - `shouldSkip`: return true to include but skip at runtime.
 * - `run`: the actual task logic, receives the full RunContext.
 */
export interface TaskSpec {
  name: string;
  ciJob?: string;
  estimatedMs?: number;
  remediation?: string;
  blocking?: boolean;
  shouldInclude?: (ctx: RunContext) => boolean;
  shouldSkip?: (ctx: RunContext) => boolean;
  run: (ctx: RunContext) => boolean | Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Utilities (unchanged from original)
export interface CommandOutput {
  cmd: string;
  stdout: string;
  stderr: string;
  code: number | null;
}

let lastCommandOutput: CommandOutput | null = null;

export function getLastCommandOutput(): CommandOutput | null {
  return lastCommandOutput;
}

export function clearLastCommandOutput(): void {
  lastCommandOutput = null;
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
  const result = spawnSync(cmd, args, {
    stdio: "pipe",
    shell: IS_WINDOWS,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    cwd: ROOT,
    timeout: options.timeout ?? 300_000,
  });

  const stdout = result.stdout ? result.stdout.toString("utf8") : "";
  const stderr = result.stderr ? result.stderr.toString("utf8") : "";

  lastCommandOutput = {
    cmd: `${cmd} ${args.join(" ")}`,
    stdout,
    stderr,
    code: result.status,
  };

  if (result.status !== 0) {
    if (result.error) {
      lastCommandOutput.stderr += `\nCommand failed to start: ${result.error.message}`;
    } else if (result.signal) {
      lastCommandOutput.stderr += `\nCommand killed by signal: ${result.signal}`;
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

// ---------------------------------------------------------------------------
// Declarative task registry
// ---------------------------------------------------------------------------

function integrationDatabases(singleDb?: IntegrationDbType): IntegrationDbType[] {
  if (singleDb) return [singleDb];
  return [...INTEGRATION_DB_MATRIX];
}

/** Builds the RunContext from the tier, profile, and options. */
export function makeRunContext(
  tier: PrecheckTier,
  profile: ChangeProfile,
  testSecret: string,
  options: PrecheckOptions,
): RunContext {
  return { tier, profile, testSecret, options };
}

// ── Base (static) tasks ─────────────────────────────────────────────────────

const BASE_TASKS: TaskSpec[] = [
  {
    name: "Test Config Safety",
    estimatedMs: 1000,
    run: () => runCommand("bun", ["run", "scripts/check-test-db-safety.ts"]),
  },
  {
    name: "Format, Lint & Check",
    ciJob: "whitebox",
    estimatedMs: 20000,
    remediation: "bun run format && bun run lint && bun run check",
    shouldSkip: (ctx) => ctx.tier === "push" && ctx.profile.paths.length === 0,
    run: () =>
      runCommand("bun", ["run", "format"], {}) &&
      runCommand("bun", ["run", "lint"], {}) &&
      runCommand("bun", ["run", "check"], {}),
  },
  {
    name: "Slop Scanner",
    ciJob: "whitebox",
    estimatedMs: 2000,
    remediation: "bun run slop",
    shouldSkip: (ctx) => ctx.tier !== "full" && !ctx.profile.hasSourceCode && !ctx.profile.hasInfra,
    run: () => runCommand("bun", ["run", "scripts/slop-scanner.ts"]),
  },
  {
    name: "Import Validation",
    ciJob: "whitebox",
    estimatedMs: 3000,
    shouldSkip: (ctx) => ctx.tier !== "full" && !ctx.profile.hasSourceCode && !ctx.profile.hasInfra,
    run: () => runCommand("bun", ["run", "scripts/validate-imports.ts"]),
  },
  {
    name: "Secret Misuse Scan",
    ciJob: "whitebox",
    estimatedMs: 1500,
    remediation: "bun run scripts/scan-secret-misuse.ts",
    shouldSkip: (ctx) => ctx.tier !== "full" && !ctx.profile.hasSourceCode && !ctx.profile.hasInfra,
    run: () => runCommand("bun", ["run", "scripts/scan-secret-misuse.ts", "--strict"]),
  },
  {
    name: "Security Regression Tests",
    ciJob: "whitebox",
    estimatedMs: 1000,
    remediation:
      "bun test tests/unit/hooks/defense-in-depth.test.ts tests/unit/hooks/authentication.test.ts tests/unit/hooks/authorization.test.ts tests/unit/role-permission-access.test.ts tests/unit/hooks/setup.test.ts tests/unit/hooks/security-headers.test.ts",
    shouldSkip: (ctx) => ctx.tier === "push" && !ctx.profile.hasSourceCode && !ctx.profile.hasInfra,
    run: () =>
      runCommand("bun", [
        "test",
        "tests/unit/hooks/defense-in-depth.test.ts",
        "tests/unit/hooks/authentication.test.ts",
        "tests/unit/hooks/authorization.test.ts",
        "tests/unit/role-permission-access.test.ts",
        "tests/unit/hooks/setup.test.ts",
        "tests/unit/hooks/security-headers.test.ts",
      ]),
  },
  {
    name: "Docs Lint",
    // Always runs — no corresponding CI job (local-only validation)
    estimatedMs: 2000,
    shouldSkip: (ctx) => ctx.tier === "push" && !ctx.profile.hasDocs && !ctx.profile.hasInfra,
    run: () => runCommand("bun", ["run", "lint:docs"]),
  },
  {
    name: "Benchmark MDX Lint",
    // Always runs — no corresponding CI job (local-only validation)
    estimatedMs: 2000,
    shouldSkip: (ctx) => ctx.tier === "push" && !ctx.profile.hasDocs && !ctx.profile.hasInfra,
    run: () => runCommand("bun", ["run", "lint:benchmark-mdx"]),
  },
  {
    name: "Dependency Audit (high CVE)",
    ciJob: "whitebox",
    estimatedMs: 30000,
    shouldSkip: (ctx) => {
      if (ctx.tier === "full") return false;
      return !ctx.profile.paths.some((f) => f === "package.json" || f === "bun.lock");
    },
    run: () =>
      runCommand("bun", ["audit", "--severity=high"], {
        timeout: 120_000,
      }),
  },
  {
    name: "Full Unit Tests",
    ciJob: "whitebox",
    estimatedMs: 60000,
    remediation: "bun test --reporter=verbose",
    shouldSkip: (ctx) =>
      ctx.tier === "push" &&
      !ctx.profile.hasSourceCode &&
      !ctx.profile.hasInfra &&
      !ctx.profile.hasDbInfra,
    run: (ctx) =>
      runCommand(
        "bun",
        ctx.tier === "push"
          ? ["run", "scripts/test-smart.ts", "--unit-only"]
          : ["run", "test:unit"],
        { silent: true, timeout: 600_000 },
      ),
  },
  {
    name: "Production Build",
    ciJob: "build",
    estimatedMs: 120000,
    // Match CI build job: COMPILE_ALL_ADAPTERS=true so testing harness stays in the
    // artifact used by benchmarks / db-tests. Deploy strip is verified separately.
    remediation: "COMPILE_ALL_ADAPTERS=true bun run build",
    shouldSkip: (ctx) => ctx.tier === "push" && !ctx.profile.needsCiSmoke,
    run: () =>
      runCommand("bun", ["run", "build"], {
        silent: true,
        timeout: 600_000,
        env: { ...process.env, COMPILE_ALL_ADAPTERS: "true" },
      }),
  },
  {
    name: "Benchmark Build Backdoor Check",
    estimatedMs: 2000,
    remediation: "COMPILE_ALL_ADAPTERS=true bun run build",
    shouldSkip: (ctx) => ctx.tier === "push" && !ctx.profile.needsCiSmoke,
    run: () =>
      runCommand("bun", ["run", "scripts/verify-prod-build-backdoor.ts", "--mode=bench"], {
        silent: true,
        timeout: 60_000,
      }),
  },
  {
    name: "Deploy Build Backdoor Probe",
    estimatedMs: 35000,
    ciJob: "whitebox",
    remediation:
      "Ensure testBackdoorStripperPlugin patterns match all testing handler import paths (check vite.config.ts and scripts/verify-prod-build-backdoor.ts markers)",
    shouldSkip: (ctx) => ctx.tier === "push" && !ctx.profile.needsCiSmoke,
    run: () => {
      // Rebuild WITHOUT COMPILE_ALL_ADAPTERS to verify the deploy strip of /api/testing.
      // Isolated from the CI-parity COMPILE_ALL_ADAPTERS build above.
      const buildOk =
        runCommand("bun", ["run", "build"], {
          silent: true,
          timeout: 300_000,
          env: { ...process.env, COMPILE_ALL_ADAPTERS: "" },
        }) !== false;
      if (!buildOk) return false;
      return (
        runCommand("bun", ["run", "scripts/verify-prod-build-backdoor.ts", "--mode=deploy"], {
          silent: true,
          timeout: 60_000,
        }) !== false
      );
    },
  },
  {
    name: "Benchmark Local Preflight",
    estimatedMs: 3000,
    remediation: "bun run verify:benchmark-local",
    shouldSkip: (ctx) => {
      const includeDb = ctx.options.includeDbTasks ?? ctx.tier === "full";
      return !includeDb || ctx.options.skipBenchmarks === true;
    },
    run: () =>
      runCommand("bun", ["run", "scripts/verify-benchmark-local.ts"], {
        silent: true,
        timeout: 60_000,
      }),
  },
];

// ── DB tasks ─────────────────────────────────────────────────────────────────

/**
 * Shared runner for integration and benchmark DB tasks.
 * Eliminates the ~60-line duplicated block that existed in the old
 * imperative buildPrecheckTasks.
 */
function runDbTask(
  db: IntegrationDbType,
  kind: "integration" | "benchmark",
  ctx: RunContext,
): boolean | Promise<boolean> {
  if (db !== "sqlite" && !checkNetworkDbReachable(db)) {
    const port = getDefaultDbPort(db);
    console.error(`\n❌ ${db} is not reachable at 127.0.0.1:${port}.`);

    if (process.stdout.isTTY && process.stdin.isTTY) {
      const answer = prompt(
        `   Would you like to automatically start the Docker container for ${db}? [Y/n] `,
      );
      if (answer === null || answer.trim().toLowerCase() !== "n") {
        console.log(`   Starting Docker container...`);
        const dockerResult = spawnSync(
          "docker",
          ["compose", "-f", "tests/docker-compose.yml", "--profile", db, "up", "-d"],
          { stdio: "inherit", shell: IS_WINDOWS },
        );
        if (dockerResult.status === 0) {
          console.log(`   ✅ Docker container started! Waiting 3s for DB initialization...`);
          spawnSync(IS_WINDOWS ? "timeout" : "sleep", [IS_WINDOWS ? "3" : "3"], { shell: true });
          if (checkNetworkDbReachable(db)) {
            console.log(`   ✅ DB is now reachable!`);
          } else {
            console.error(`   ❌ DB still unreachable after startup.`);
            return false;
          }
        } else {
          console.error(`   ❌ Failed to start Docker container.`);
          return false;
        }
      } else {
        return false;
      }
    } else {
      console.error(
        `   Start Docker: docker compose -f tests/docker-compose.yml --profile ${db} up -d`,
      );
      return false;
    }
  }

  const timeout = db === "mongodb" || db === "mariadb" ? 900_000 : 600_000;

  if (kind === "integration") {
    return runCommand(
      "bun",
      ["run", "scripts/run-integration-tests.ts", `--db=${db}`, "--no-build"],
      {
        env: {
          ...getIntegrationTestEnv(db),
          TEST_API_SECRET: ctx.testSecret,
          ADMIN_PASSWORD: "Password123!",
        },
        timeout,
      },
    );
  }

  return runCommand("bun", ["run", "scripts/run-core-benchmarks.ts", `--db=${db}`], {
    env: getBenchmarkTestEnv(db, { TEST_API_SECRET: ctx.testSecret }),
    timeout,
  });
}

/**
 * Creates integration + benchmark task specs for a single DB adapter.
 * All skip logic lives within the spec so there is no external conditional.
 */
function createDbTasks(db: IntegrationDbType): TaskSpec[] {
  const contentNodesContractTask: TaskSpec = {
    name: "Content Nodes Contract (sqlite)",
    ciJob: "db-tests (sqlite)",
    estimatedMs: 120000,
    shouldSkip: (ctx) => {
      const includeDb = ctx.options.includeDbTasks ?? ctx.tier === "full";
      return !includeDb || db !== "sqlite";
    },
    run: (ctx) =>
      runCommand("bun", ["test", "tests/integration/databases/content-nodes-contract.test.ts"], {
        env: {
          ...getIntegrationTestEnv("sqlite"),
          TEST_API_SECRET: ctx.testSecret,
        },
        timeout: 300_000,
      }),
  };

  return [
    ...(db === "sqlite" ? [contentNodesContractTask] : []),
    {
      name: `Integration (${db})`,
      ciJob: `db-tests (${db})`,
      estimatedMs: 180000,
      shouldSkip: (ctx) => {
        const includeDb = ctx.options.includeDbTasks ?? ctx.tier === "full";
        return !includeDb;
      },
      run: (ctx) => runDbTask(db, "integration", ctx),
    },
    {
      name: `Benchmarks (${db})`,
      ciJob: `bench-core (${db})`,
      estimatedMs: 120000,
      shouldSkip: (ctx) => {
        if (ctx.options.skipBenchmarks) return true;
        const includeDb = ctx.options.includeDbTasks ?? ctx.tier === "full";
        return !includeDb;
      },
      run: (ctx) => runDbTask(db, "benchmark", ctx),
    },
  ];
}

// ---------------------------------------------------------------------------
// Resolver — converts declarative specs into executable Task[]
// ---------------------------------------------------------------------------

/**
 * Build the ordered task list for a precheck run.
 *
 * Base tasks always appear in the order defined in BASE_TASKS.
 * DB tasks are appended per adapter.
 */
export function buildPrecheckTasks(
  tier: PrecheckTier,
  profile: ChangeProfile,
  testSecret: string,
  options: Pick<PrecheckOptions, "skipBenchmarks" | "singleDb" | "includeDbTasks"> = {},
): Task[] {
  const ctx: RunContext = {
    tier,
    profile,
    testSecret,
    options: {
      tier,
      changedPaths: profile.paths,
      ...options,
    },
  };

  const dbs = integrationDatabases(options.singleDb);
  const dbSpecs = dbs.flatMap((db) => createDbTasks(db));

  const allSpecs = [...BASE_TASKS, ...dbSpecs];

  return allSpecs
    .filter((spec) => !spec.shouldInclude || spec.shouldInclude(ctx))
    .map(
      (spec): Task => ({
        name: spec.name,
        ciJob: spec.ciJob,
        estimatedMs: spec.estimatedMs,
        remediation: spec.remediation,
        blocking: spec.blocking ?? true,
        skip: spec.shouldSkip ? spec.shouldSkip(ctx) : false,
        run: () => spec.run(ctx),
      }),
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function resolveActiveTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => {
    if (typeof t.skip === "function") return !t.skip();
    return !t.skip;
  });
}

/**
 * Debug helper — returns a plan summary without running anything.
 * Useful for logging at the start of a precheck run and for testing
 * task selection logic.
 */
export function getPrecheckPlan(
  tier: PrecheckTier,
  profile: ChangeProfile,
  testSecret: string,
  options: Pick<PrecheckOptions, "skipBenchmarks" | "singleDb" | "includeDbTasks"> = {},
): { totalEstimatedMs: number; taskNames: string[]; skipped: string[] } {
  const tasks = buildPrecheckTasks(tier, profile, testSecret, options);
  const active = resolveActiveTasks(tasks);
  return {
    totalEstimatedMs: active.reduce((sum, t) => sum + (t.estimatedMs ?? 0), 0),
    taskNames: active.map((t) => t.name),
    skipped: tasks.filter((t) => t.skip).map((t) => t.name),
  };
}

/**
 * Validates that every task's ciJob field corresponds to an actual job
 * name in .github/workflows/ci.yml.  Skips matrix jobs (names containing
 * parentheses like "db-tests (sqlite)") since those are generated dynamically.
 *
 * Only runs locally (skipped in CI).  Requires no external dependencies —
 * uses a simple regex scan of the YAML file.
 */
export function validateCiParity(): void {
  if (process.env.CI) return;

  const fs = require("node:fs");
  const path = require("node:path");
  const workflowPath = path.join(ROOT, ".github", "workflows", "ci.yml");

  let workflowText: string;
  try {
    workflowText = fs.readFileSync(workflowPath, "utf8");
  } catch {
    return; // file not found — not blocking
  }

  // Extract all top-level job names from ci.yml
  // Matches lines like "  security-audit:" or "  bench-core:"
  const jobNameRx = /^  ([a-z][a-z0-9-]+):\s*$/gm;
  const ciJobNames = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = jobNameRx.exec(workflowText)) !== null) {
    ciJobNames.add(m[1]);
  }

  // Scan all task specs for mismatched ciJob values
  const mismatches: string[] = [];

  for (const spec of BASE_TASKS) {
    if (!spec.ciJob) continue;
    if (!ciJobNames.has(spec.ciJob) && !spec.ciJob.includes("(")) {
      mismatches.push(`  "${spec.name}" → ciJob="${spec.ciJob}" (no matching job in ci.yml)`);
    }
  }

  // Also scan DB tasks for patterns
  const dbJobPatterns = ["db-tests", "bench-core"];
  for (const pattern of dbJobPatterns) {
    if (!ciJobNames.has(pattern)) {
      mismatches.push(`  DB pattern "${pattern}" — no matching job in ci.yml`);
    }
  }

  if (mismatches.length > 0) {
    console.warn("\n⚠️  ciJob parity check — mismatches found:");
    console.warn("   These ciJob values do not match any job name in ci.yml:\n");
    for (const msg of mismatches) console.warn(msg);
    console.warn("\n   Update the ciJob field or the ci.yml job name to keep them aligned.\n");
  }
}
