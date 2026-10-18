/**
 * @file scripts/run-local-db-matrix.ts
 * @description Smart local database-parity runner. Detects reachable local
 *              database services (PostgreSQL, MariaDB, MongoDB), optionally
 *              starts them through Docker Compose, and executes the adapter
 *              contract suites against every active engine.
 *
 * This is the local mirror of the CI `db-tests` matrix: the pre-push hook only
 * proves SQLite, so an adapter-specific regression could otherwise reach CI.
 *
 * Usage:
 *   bun run test:parity                    # auto-detect engines, no build
 *   bun run test:parity -- --docker        # start missing engines first
 *   bun run test:parity -- --build         # rebuild before running
 *   bun run test:parity -- --require-all   # fail if any engine is offline
 *   bun run test:parity -- --only=sqlite,postgresql
 *   bun run test:parity -- tests/integration/databases/contract.test.ts
 *
 * Features:
 * - probes local ports (5432, 3306, 27017) with rapid TCP sockets
 * - always runs the contract suite on SQLite (zero-config)
 * - `--docker` boots offline services via the test compose profiles
 * - explicit failure report when an engine is skipped on `--require-all`
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import net from "node:net";
import {
  DEFAULT_INTEGRATION_TEST_API_SECRET,
  DEFAULT_INTEGRATION_JWT,
  DEFAULT_INTEGRATION_ENCRYPTION,
  DEFAULT_INTEGRATION_ADMIN_PASSWORD,
} from "./integration-harness.ts";

const ROOT = join(import.meta.dirname, "..");
const COMPOSE_FILE = join(ROOT, "tests", "docker-compose.yml");

/** Contract suites that must agree across all four adapters. */
const DEFAULT_TEST_PATHS = [
  "tests/integration/databases/contract.test.ts",
  "tests/integration/databases/db-interface.test.ts",
  "tests/integration/databases/differential-parity.test.ts",
  "tests/integration/databases/bulk-operations-contract.test.ts",
];

interface CliOptions {
  tests: string[];
  docker: boolean;
  build: boolean;
  requireAll: boolean;
  only: Set<string> | null;
}

interface DbTarget {
  name: "sqlite" | "postgresql" | "mariadb" | "mongodb";
  label: string;
  port?: number;
  host: string;
}

const TARGETS: DbTarget[] = [
  { name: "sqlite", label: "SQLite (Built-in)", host: "127.0.0.1" },
  { name: "postgresql", label: "PostgreSQL", port: 5432, host: "127.0.0.1" },
  { name: "mariadb", label: "MariaDB", port: 3306, host: "127.0.0.1" },
  { name: "mongodb", label: "MongoDB", port: 27017, host: "127.0.0.1" },
];

function parseArgs(argv: string[]): CliOptions {
  const positional: string[] = [];
  let tests: string[] = [];
  let docker = false;
  let build = false;
  let requireAll = false;
  let only: Set<string> | null = null;

  for (const raw of argv) {
    if (raw === "--docker") docker = true;
    else if (raw === "--build") build = true;
    else if (raw === "--require-all") requireAll = true;
    else if (raw.startsWith("--only=")) {
      only = new Set(
        raw
          .slice("--only=".length)
          .split(",")
          .map((name) => name.trim().toLowerCase())
          .filter(Boolean),
      );
    } else if (raw.startsWith("--tests=")) {
      tests = raw
        .slice("--tests=".length)
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
    } else if (!raw.startsWith("-")) positional.push(raw);
  }

  if (positional.length > 0) tests = positional;

  const resolved =
    tests.length > 0 ? tests : DEFAULT_TEST_PATHS.filter((p) => existsSync(join(ROOT, p)));
  if (resolved.length === 0) {
    throw new Error("No integration test paths found — pass tests as arguments or --tests=<csv>.");
  }

  return { tests: resolved, docker, build, requireAll, only };
}

function isPortReachable(port: number, host = "127.0.0.1", timeoutMs = 350): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let reachable = false;
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      reachable = true;
      socket.destroy();
    });
    socket.once("timeout", () => {
      socket.destroy();
    });
    socket.once("error", () => {
      socket.destroy();
    });
    socket.once("close", () => {
      resolve(reachable);
    });
    socket.connect(port, host);
  });
}

function commandAvailable(command: string): boolean {
  const probe = spawnSync(command, ["--version"], {
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  return probe.status === 0;
}

/** Start a compose profile, then wait for its port. Returns true when reachable. */
async function startDockerTarget(target: DbTarget): Promise<boolean> {
  if (!target.port) return true;
  if (!existsSync(COMPOSE_FILE) || !commandAvailable("docker")) return false;

  console.log(`   ⏳ Starting ${target.label} via docker compose (profile: ${target.name})...`);
  const start = spawnSync(
    "docker",
    ["compose", "-f", COMPOSE_FILE, "--profile", target.name, "up", "-d", "--wait"],
    { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" },
  );
  if (start.status !== 0) return false;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await isPortReachable(target.port, target.host)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

interface RunResult {
  target: DbTarget;
  status: "PASS" | "FAIL" | "SKIP";
  reason?: string;
  durationMs: number;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  console.log("\n=================================================================");
  console.log("🏁 SveltyCMS — Local Database Parity Runner");
  console.log(`   Engines: SQLite, PostgreSQL, MariaDB, MongoDB`);
  console.log(`   Suites:  ${options.tests.length} (${options.tests.join(", ")})`);
  console.log("=================================================================\n");

  const results: RunResult[] = [];

  const targets = options.only
    ? TARGETS.filter((target) => options.only?.has(target.name))
    : TARGETS;
  if (targets.length === 0) {
    throw new Error(
      `--only selected no known engines. Choose from: ${TARGETS.map((t) => t.name).join(", ")}`,
    );
  }

  for (const target of targets) {
    if (!target.port) {
      // SQLite is always available
      console.log(`\n🔍 Checking ${target.label}... Available (In-Process)`);
    } else {
      process.stdout.write(`🔍 Checking ${target.label} on port ${target.port}... `);
      let isUp = await isPortReachable(target.port, target.host);
      if (!isUp && options.docker) {
        console.log("Offline — attempting Docker start");
        isUp = await startDockerTarget(target);
      }
      if (!isUp) {
        console.log("Offline (Skipped)");
        results.push({
          target,
          status: "SKIP",
          reason: `Port ${target.port} not reachable${options.docker ? " (docker start failed)" : "; pass --docker"}`,
          durationMs: 0,
        });
        continue;
      }
      console.log("Online!");
    }

    console.log(`\n🧪 Executing ${options.tests.length} contract suite(s) for ${target.label}...`);
    const start = Date.now();
    const run = spawnSync(
      "bun",
      [
        "run",
        "scripts/run-integration.ts",
        ...(options.build ? [] : ["--no-build"]),
        ...options.tests,
      ],
      {
        cwd: ROOT,
        stdio: "inherit",
        env: {
          ...process.env,
          DB_TYPE: target.name,
          DB_HOST: target.host,
          DB_NAME: "sveltycms_test",
          TEST_MODE: "true",
          TEST_API_SECRET: process.env.TEST_API_SECRET || DEFAULT_INTEGRATION_TEST_API_SECRET,
          JWT_SECRET_KEY: process.env.JWT_SECRET_KEY || DEFAULT_INTEGRATION_JWT,
          ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || DEFAULT_INTEGRATION_ENCRYPTION,
          ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || DEFAULT_INTEGRATION_ADMIN_PASSWORD,
        },
      },
    );

    const durationMs = Date.now() - start;
    if (run.status === 0) {
      console.log(`✅ ${target.label} passed in ${durationMs}ms`);
      results.push({ target, status: "PASS", durationMs });
    } else {
      console.error(`❌ ${target.label} failed in ${durationMs}ms`);
      results.push({ target, status: "FAIL", reason: "Test assertions failed", durationMs });
    }
  }

  // Summary
  console.log("\n=================================================================");
  console.log("📊 Local Parity Summary");
  console.log("=================================================================");
  for (const res of results) {
    const icon = res.status === "PASS" ? "✅" : res.status === "SKIP" ? "⚪" : "❌";
    const details = res.reason ? ` (${res.reason})` : ` (${res.durationMs}ms)`;
    console.log(`${icon} ${res.target.label.padEnd(24)} : ${res.status}${details}`);
  }
  console.log("=================================================================\n");

  const hasFailures = results.some((r) => r.status === "FAIL");
  const skipped = results.filter((r) => r.status === "SKIP");
  const passedAny = results.some((r) => r.status === "PASS");

  if (hasFailures) {
    console.error("❌ Parity run finished with failures.");
    process.exit(1);
  }
  if (!passedAny) {
    console.error("❌ No databases were executed.");
    process.exit(1);
  }
  if (skipped.length > 0 && options.requireAll) {
    console.error(
      `❌ ${skipped.length} engine(s) offline under --require-all: ${skipped
        .map((r) => r.target.name)
        .join(", ")}`,
    );
    process.exit(1);
  }
  if (skipped.length > 0) {
    console.warn(
      `⚠️  ${skipped.length} engine(s) skipped — this run is NOT full parity. ` +
        `Start them with docker compose or rerun with --docker.`,
    );
  }

  console.log("✅ All active database engines passed the parity suites.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal matrix error:", err);
  process.exit(1);
});
