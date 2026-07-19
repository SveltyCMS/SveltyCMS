#!/usr/bin/env bun
/**
 * @file scripts/run-e2e-ci.ts
 * @description CI-parity E2E runner — mirrors GitHub Actions e2e + e2e-prep jobs.
 *
 * Default for `bun run test:e2e`:
 * 1. Builds with COMPILE_ALL_ADAPTERS=true (keeps /api/testing in the artifact)
 * 2. Or, with --no-build, verifies the existing build still has the testing harness
 * 3. Starts adapter-node preview on port 4173 with TEST_MODE=true
 * 4. Runs wizard → firstuser → auth-setup, then chromium
 * 5. Stops the server
 *
 * Dev-server shortcut (not CI-identical): `bun run test:e2e:dev`
 *
 * Usage:
 *   bun run scripts/run-e2e-ci.ts                    # full run (build + all tests)
 *   bun run scripts/run-e2e-ci.ts --no-build         # reuse build (must include testing API)
 *   bun run scripts/run-e2e-ci.ts --grep="Unified"   # filter tests
 *   bun run scripts/run-e2e-ci.ts --project=chromium --grep="access"
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const PORT = "4173";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI_ENV = {
  ...process.env,
  TEST_MODE: "true",
  SKIP_TEST_CLEANUP: "true",
  ADMIN_PASSWORD: "Password123!",
  PASSWORD_MIN_LENGTH: "8",
  HOST: "127.0.0.1",
  PORT,
  ORIGIN: BASE_URL,
  PLAYWRIGHT_TEST_BASE_URL: BASE_URL,
  DB_TYPE: "sqlite",
  DB_HOST: "127.0.0.1",
  DB_NAME: "e2e_ci_test",
  DB_USER: "",
  DB_PASSWORD: "",
};

/** Markers that only appear when the real testing handler is bundled (bench mode). */
const FULL_HANDLER_MARKERS = ["Unauthorized: Testing endpoints are disabled", "[TestingHandler]"];
const STUB_MARKERS = ["SVELTY_TEST_BACKDOOR_STRIPPED", "virtual:test-noop"];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function collectJsFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) collectJsFiles(full, out);
    else if (st.isFile() && name.endsWith(".js")) out.push(full);
  }
  return out;
}

/**
 * Ensure build/index.js exists and still contains /api/testing (not deploy-stripped).
 * Plain `bun run build` strips the handler → E2E auth/seed fails with confusing errors.
 */
function assertE2eBuildHasTestingHarness(): { ok: true } | { ok: false; reason: string } {
  const entry = join(ROOT, "build", "index.js");
  if (!existsSync(entry)) {
    return {
      ok: false,
      reason:
        "Missing build/index.js. Run without --no-build, or: COMPILE_ALL_ADAPTERS=true bun run build",
    };
  }

  const scanDirs = [
    join(ROOT, "build", "server"),
    join(ROOT, "build", "server", "chunks"),
    join(ROOT, ".svelte-kit", "output", "server"),
    join(ROOT, ".svelte-kit", "output", "server", "chunks"),
  ];
  const files = scanDirs.flatMap((d) => collectJsFiles(d));
  // Also scan top-level build/*.js (adapter-node layout variants)
  if (existsSync(join(ROOT, "build"))) {
    for (const name of readdirSync(join(ROOT, "build"))) {
      const full = join(ROOT, "build", name);
      try {
        if (statSync(full).isFile() && name.endsWith(".js")) files.push(full);
      } catch {
        /* skip */
      }
    }
  }

  let full = false;
  let stub = false;
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (FULL_HANDLER_MARKERS.some((m) => content.includes(m))) full = true;
    if (STUB_MARKERS.some((m) => content.includes(m))) stub = true;
  }

  if (full) return { ok: true };

  if (stub) {
    return {
      ok: false,
      reason:
        "Build has /api/testing STRIPPED (deploy build). E2E needs the test harness.\n" +
        "  Fix: COMPILE_ALL_ADAPTERS=true bun run build\n" +
        "  Or:  bun run test:e2e   (rebuilds automatically without --no-build)",
    };
  }

  return {
    ok: false,
    reason:
      "Could not find testing handler markers in build output.\n" +
      "  Fix: COMPILE_ALL_ADAPTERS=true bun run build\n" +
      "  Verify: bun run scripts/verify-prod-build-backdoor.ts --mode=bench",
  };
}

async function waitForServer(url: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url + "/api/system/health");
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms at ${url}`);
}

async function runCmd(cmd: string, args: string[], env: Record<string, string>): Promise<number> {
  return new Promise((resolve) => {
    // Never use shell:true on Windows for Playwright — cmd.exe treats `|` in --grep as a pipe.
    const proc = spawn(cmd, args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: false,
      env: { ...process.env, ...env },
    });
    proc.on("close", (code) => resolve(code ?? 1));
    proc.on("error", (err) => {
      console.error(`Failed to spawn ${cmd}:`, err);
      resolve(1);
    });
  });
}

/** Parse --grep=pattern or --grep pattern without shell pipe corruption. */
function parseGrep(argv: string[]): { grep: string; rest: string[] } {
  const rest: string[] = [];
  let grep = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--no-build") continue;
    if (a.startsWith("--grep=")) {
      grep = a.slice("--grep=".length);
      continue;
    }
    if (a === "--grep") {
      grep = argv[++i] || "";
      continue;
    }
    rest.push(a);
  }
  return { grep, rest };
}

async function buildWithTestingHarness(): Promise<void> {
  console.log("Building with COMPILE_ALL_ADAPTERS=true (keeps /api/testing)...");
  const buildCode = await runCmd("bun", ["run", "build"], {
    ...process.env,
    COMPILE_ALL_ADAPTERS: "true",
  } as Record<string, string>);
  if (buildCode !== 0) {
    console.error("Build failed");
    process.exit(1);
  }
  console.log("Build complete.");

  // Fail closed if stripper still removed the harness
  try {
    execSync("bun run scripts/verify-prod-build-backdoor.ts --mode=bench", {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, COMPILE_ALL_ADAPTERS: "true" },
    });
  } catch {
    console.error(
      "❌ Post-build harness check failed. E2E cannot seed/login without /api/testing.",
    );
    process.exit(1);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const skipBuild = argv.includes("--no-build");
  const { grep, rest: extraArgs } = parseGrep(argv);

  if (!skipBuild) {
    await buildWithTestingHarness();
  } else {
    console.log("⏭️  --no-build: verifying existing artifact has /api/testing...");
    let check = assertE2eBuildHasTestingHarness();
    if (!check.ok) {
      console.warn(`⚠️  ${check.reason}`);
      console.warn("   Auto-rebuilding with COMPILE_ALL_ADAPTERS=true...");
      await buildWithTestingHarness();
      check = assertE2eBuildHasTestingHarness();
      if (!check.ok) {
        console.error(`❌ ${check.reason}`);
        process.exit(1);
      }
    }
    console.log("✅ Build artifact includes testing harness.");
  }

  // Start preview server
  console.log(`\nStarting preview server on ${BASE_URL}...`);
  if (grep) console.log(`🔍 Playwright --grep: ${grep}`);
  const entryPoint = join(ROOT, "build", "index.js");
  if (!existsSync(entryPoint)) {
    console.error(`❌ Missing ${entryPoint} after build check.`);
    process.exit(1);
  }
  const server = spawn("node", [entryPoint], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: CI_ENV,
  });

  server.stdout?.on("data", (d: Buffer) => process.stdout.write(`[server] ${d}`));
  server.stderr?.on("data", (d: Buffer) => process.stderr.write(`[server:err] ${d}`));

  const cleanup = () => {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        server.kill("SIGTERM");
      }
    } catch {
      /* ok */
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  try {
    await waitForServer(BASE_URL);
    console.log("Server ready.\n");

    // Phase 1: Setup (wizard → firstuser → auth-setup)
    console.log("--- Phase 1: Wizard + First User + Auth Setup ---");
    const setupCode = await runCmd(
      "bun",
      [
        "x",
        "playwright",
        "test",
        "--project=wizard",
        "--project=firstuser",
        "--project=auth-setup",
      ],
      CI_ENV,
    );
    if (setupCode !== 0) {
      console.error("Setup phase failed. Fix before running main tests.");
      process.exit(1);
    }

    // Phase 2: Main tests
    console.log("\n--- Phase 2: Chromium E2E Tests ---");
    const pwArgs = ["x", "playwright", "test", "--project=chromium"];
    if (grep) pwArgs.push("--grep", grep);
    pwArgs.push(...extraArgs);

    // Skip deps since we already ran them
    const mainEnv = { ...CI_ENV, SKIP_E2E_DEPS: "true" };
    const mainCode = await runCmd("bun", pwArgs, mainEnv);

    if (mainCode !== 0) {
      console.error("\nSome E2E tests failed. Check output above.");
      process.exit(1);
    }

    console.log("\nAll E2E tests passed.");
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error("E2E CI runner crashed:", err);
  process.exit(1);
});
