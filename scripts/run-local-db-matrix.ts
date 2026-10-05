/**
 * @file scripts/run-local-db-matrix.ts
 * @description Smart local 4-database integration matrix runner. Auto-detects
 *              reachable local database services (PostgreSQL, MariaDB, MongoDB)
 *              and executes the integration contract suite against all active engines.
 *
 * Features:
 * - probes local database ports (5432, 3306, 27017) with rapid TCP sockets
 * - always runs SQLite contract suite (zero-config, local)
 * - runs contract tests against any running Docker or local DB service
 * - reports clean tabular pass/skip/fail summary with execution times
 */

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

interface RunResult {
  target: DbTarget;
  status: "PASS" | "FAIL" | "SKIP";
  reason?: string;
  durationMs: number;
}

async function main(): Promise<void> {
  console.log("\n=================================================================");
  console.log("🏁 SveltyCMS — Local Database Matrix Runner (Docker-Parity)");
  console.log("   Detecting available local engines: SQLite, PG, MariaDB, Mongo");
  console.log("=================================================================\n");

  const results: RunResult[] = [];

  for (const target of TARGETS) {
    if (!target.port) {
      // SQLite is always available
      console.log(`\n🔍 Checking ${target.label}... Available (In-Process)`);
    } else {
      process.stdout.write(`🔍 Checking ${target.label} on port ${target.port}... `);
      const isUp = await isPortReachable(target.port, target.host);
      if (!isUp) {
        console.log("Offline (Skipped)");
        results.push({
          target,
          status: "SKIP",
          reason: `Port ${target.port} not reachable`,
          durationMs: 0,
        });
        continue;
      }
      console.log("Online!");
    }

    console.log(`\n🧪 Executing contract suite for ${target.label}...`);
    const start = Date.now();
    const run = spawnSync(
      "bun",
      [
        "run",
        "scripts/run-integration.ts",
        "--no-build",
        "tests/integration/databases/contract.test.ts",
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
          JWT_SECRET_KEY: DEFAULT_INTEGRATION_JWT,
          ENCRYPTION_KEY: DEFAULT_INTEGRATION_ENCRYPTION,
          ADMIN_PASSWORD: DEFAULT_INTEGRATION_ADMIN_PASSWORD,
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
  console.log("📊 Local Matrix Summary Report");
  console.log("=================================================================");
  for (const res of results) {
    const icon = res.status === "PASS" ? "✅" : res.status === "SKIP" ? "⚪" : "❌";
    const details = res.reason ? ` (${res.reason})` : ` (${res.durationMs}ms)`;
    console.log(`${icon} ${res.target.label.padEnd(24)} : ${res.status}${details}`);
  }
  console.log("=================================================================\n");

  const hasFailures = results.some((r) => r.status === "FAIL");
  const passedAny = results.some((r) => r.status === "PASS");

  if (hasFailures) {
    console.error("❌ Matrix execution finished with failures.");
    process.exit(1);
  } else if (!passedAny) {
    console.error("❌ No databases were executed.");
    process.exit(1);
  } else {
    console.log("✅ All active database engines passed integration contract checks.\n");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal matrix error:", err);
  process.exit(1);
});
