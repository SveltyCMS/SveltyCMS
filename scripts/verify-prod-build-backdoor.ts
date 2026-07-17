#!/usr/bin/env bun
/**
 * @file scripts/verify-prod-build-backdoor.ts
 * @description CI safety gate — prevents two catastrophic scenarios:
 *
 * ### What's at stake
 * `src/routes/api/[...path]/handlers/testing.ts` exposes endpoints for
 * database reset, seeding, cache dumps, and system reinitialization.
 * These are gated by a cryptographic secret (`x-test-secret` vs
 * `TEST_API_SECRET`), but if accidentally deployed to production,
 * the database can be wiped remotely.
 *
 * ### Modes
 * ```
 * bun run build  →  testBackdoorStripperPlugin replaces the handler
 *                     with a 404 stub (safe for production).
 *
 * COMPILE_ALL_ADAPTERS=true bun run build  →  handler is bundled
 *                     for benchmark/CI test harnesses.
 * ```
 *
 * --mode=deploy  Fail if the full testing handler IS in the build.
 *                Prevents shipping COMPILE_ALL_ADAPTERS=true to prod.
 *
 * --mode=bench   Fail if the testing handler was stripped.
 *                Prevents CI/benchmarks from silently running against
 *                a 404 stub (tests would pass with stale data).
 *
 * ### CI location
 * `.github/workflows/ci.yml` build job runs this in bench mode after
 * `COMPILE_ALL_ADAPTERS=true bun run build`.
 *
 * Usage:
 *   bun run build
 *   bun run scripts/verify-prod-build-backdoor.ts --mode=deploy
 *
 *   COMPILE_ALL_ADAPTERS=true bun run build
 *   bun run scripts/verify-prod-build-backdoor.ts --mode=bench
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const CHUNKS_DIR = join(ROOT, "build", "server", "chunks");

const FULL_HANDLER_MARKERS = [
  // Unique to the real testing handler body (not present in NAMESPACE_CONFIG alone).
  "Unauthorized: Testing endpoints are disabled",
  // handleTestingRoutes also appears in +server.ts NAMESPACE_CONFIG mapping, so
  // deploy mode must pair it with stub detection (full && !stub).
  "handleTestingRoutes",
];

// Match both pretty and compact Response forms, plus the explicit strip marker
// injected by testBackdoorStripperPlugin (virtual:test-noop).
const STUB_MARKERS = [
  "SVELTY_TEST_BACKDOOR_STRIPPED",
  'new Response("Not Found", { status: 404 })',
  'new Response("Not Found",{status:404})',
  "virtual:test-noop",
];

function getMode(): "deploy" | "bench" {
  const arg = process.argv.find((a) => a.startsWith("--mode="))?.split("=")[1];
  return arg === "bench" ? "bench" : "deploy";
}

function scanBuildChunks(): { full: boolean; stub: boolean; scanned: number } {
  if (!existsSync(CHUNKS_DIR)) {
    return { full: false, stub: false, scanned: 0 };
  }

  let full = false;
  let stub = false;
  let scanned = 0;

  for (const file of readdirSync(CHUNKS_DIR)) {
    if (!file.endsWith(".js")) continue;
    scanned++;
    const content = readFileSync(join(CHUNKS_DIR, file), "utf8");
    if (FULL_HANDLER_MARKERS.some((m) => content.includes(m))) full = true;
    if (STUB_MARKERS.some((m) => content.includes(m))) stub = true;
  }

  return { full, stub, scanned };
}

function main() {
  const mode = getMode();

  if (!existsSync(join(ROOT, "build", "index.js"))) {
    console.error("❌ build/index.js missing. Run bun run build first.");
    process.exit(1);
  }

  const { full, stub, scanned } = scanBuildChunks();
  console.log(`🔍 Build backdoor scan (${mode} mode, ${scanned} chunks)`);

  if (mode === "deploy") {
    if (full && !stub) {
      console.error(
        "❌ Full /api/testing handler detected in production build.\n" +
          "   Rebuild WITHOUT COMPILE_ALL_ADAPTERS for deploy:\n" +
          "   bun run build\n" +
          "   Never deploy COMPILE_ALL_ADAPTERS=true artifacts to production.",
      );
      process.exit(1);
    }
    console.log("  ✅ Production build: testing backdoor stripped or noop stub present.");
    process.exit(0);
  }

  // bench mode
  if (!full) {
    console.error(
      "❌ Benchmark build missing full testing handler.\n" +
        "   Rebuild with: COMPILE_ALL_ADAPTERS=true bun run build",
    );
    process.exit(1);
  }
  console.log("  ✅ Benchmark build: testing handler present for harness.");
  process.exit(0);
}

main();
