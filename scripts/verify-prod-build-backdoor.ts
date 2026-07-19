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

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BUILD_SERVER_DIR = join(ROOT, "build", "server");
const CHUNKS_DIR = join(ROOT, "build", "server", "chunks");
const SK_SERVER_DIR = join(ROOT, ".svelte-kit", "output", "server");
const SK_CHUNKS_DIR = join(ROOT, ".svelte-kit", "output", "server", "chunks");

/**
 * Strong markers that only appear in the real testing handler body.
 * Do NOT use `handleTestingRoutes` alone — NAMESPACE_CONFIG in +server.ts
 * embeds that name even when the handler is stripped to a 404 stub.
 * Do NOT use local function names like `invalidateAllCaches` — esbuild/rollup
 * minify renames them and the string disappears from production output.
 */
const FULL_HANDLER_MARKERS = ["Unauthorized: Testing endpoints are disabled", "[TestingHandler]"];

// Unique marker injected by testBackdoorStripperPlugin (virtual:test-noop).
// Do NOT use generic `new Response("Not Found"…)` — the API dispatcher and many
// routes return that for 404s, so it false-positives as "stripped" on every build.
const STUB_MARKERS = ["SVELTY_TEST_BACKDOOR_STRIPPED", "virtual:test-noop"];

function getMode(): "deploy" | "bench" {
  const arg = process.argv.find((a) => a.startsWith("--mode="))?.split("=")[1];
  return arg === "bench" ? "bench" : "deploy";
}

/** Collect .js files under dir, recursively (adapter-node nests path-based chunks on Linux). */
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
    if (st.isDirectory()) {
      collectJsFiles(full, out);
    } else if (st.isFile() && name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

function scanFiles(files: string[]): { full: boolean; stub: boolean; scanned: number } {
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

  return { full, stub, scanned: files.length };
}

function scanBuildChunks(): {
  full: boolean;
  stub: boolean;
  scanned: number;
  source: string;
} {
  // Prefer adapter output (build/) — what CI archives and downstream jobs consume.
  // adapter-node@5.x uses path-based manualChunks, so on Linux/macOS chunks land in
  // nested dirs under build/server/chunks/ (e.g. chunks/testing-*.js,
  // entries/endpoints/...). A non-recursive readdir only sees ~6 top-level files
  // and misses the testing handler entirely — which is what broke CI bench mode.
  const buildFiles = [
    ...collectJsFiles(BUILD_SERVER_DIR),
    // Entry wrappers occasionally carry re-exports / markers
    ...["index.js", "handler.js"].map((f) => join(ROOT, "build", f)).filter((p) => existsSync(p)),
  ];

  let result = { ...scanFiles(buildFiles), source: BUILD_SERVER_DIR };

  // Fall back to SvelteKit pre-adapter SSR output when adapter dir is empty/sparse.
  if (result.scanned === 0 || (!result.full && !result.stub)) {
    const skFiles = collectJsFiles(SK_SERVER_DIR);
    if (skFiles.length > 0) {
      const sk = scanFiles(skFiles);
      // Prefer SK result when build scan found no strong markers but SK has more files
      // or actual markers (handles partial adapter output).
      if (sk.scanned > 0 && (result.scanned === 0 || sk.full || sk.stub)) {
        if (result.scanned > 0 && !result.full && !result.stub) {
          console.log(
            `   ⚠️  No handler markers in ${BUILD_SERVER_DIR} (${result.scanned} files); ` +
              `scanning ${SK_SERVER_DIR}`,
          );
        } else if (result.scanned === 0) {
          console.log(`   ⚠️  No chunks in ${CHUNKS_DIR}, falling back to ${SK_CHUNKS_DIR}`);
        }
        result = { ...sk, source: SK_SERVER_DIR };
      }
    }
  }

  if (result.scanned === 0) {
    console.error(`   ❌ No .js chunks found in ${BUILD_SERVER_DIR} or ${SK_SERVER_DIR}`);
    console.error(`   The SSR build may have failed silently. Check build logs for errors.`);
  }

  return result;
}

function main() {
  const mode = getMode();

  const buildEntry = join(ROOT, "build", "index.js");
  const skEntry = join(ROOT, ".svelte-kit", "output", "server", "index.js");
  if (!existsSync(buildEntry) && !existsSync(skEntry)) {
    console.error("❌ build/index.js missing. Run bun run build first.");
    process.exit(1);
  }
  if (!existsSync(buildEntry)) {
    console.log(`   ⚠️  ${buildEntry} missing — scanning SvelteKit output directly.`);
  }

  const { full, stub, scanned, source } = scanBuildChunks();
  console.log(`🔍 Build backdoor scan (${mode} mode, ${scanned} chunks from ${source})`);

  if (scanned === 0) {
    console.error(
      "❌ No SSR chunks found. The SSR build likely failed silently.\n" +
        "   Check the build logs above for module resolution errors.\n" +
        "   Common causes: missing config files, broken imports, case-sensitivity.",
    );
    process.exit(1);
  }

  if (mode === "deploy") {
    // Strong body markers mean the real handler shipped. Stub presence is advisory
    // only (stripper injects SVELTY_TEST_BACKDOOR_STRIPPED when it replaces the module).
    if (full) {
      console.error(
        "❌ Full /api/testing handler detected in production build.\n" +
          "   Rebuild WITHOUT COMPILE_ALL_ADAPTERS for deploy:\n" +
          "   bun run build\n" +
          "   Never deploy COMPILE_ALL_ADAPTERS=true artifacts to production." +
          (stub ? "\n   (strip marker also present — mixed build?)" : ""),
      );
      process.exit(1);
    }
    console.log(
      stub
        ? "  ✅ Production build: testing backdoor stripped (noop stub present)."
        : "  ✅ Production build: no full testing handler markers (safe).",
    );
    process.exit(0);
  }

  // bench mode
  if (!full) {
    console.error(
      "❌ Benchmark build missing full testing handler.\n" +
        "   Rebuild with: COMPILE_ALL_ADAPTERS=true bun run build\n" +
        `   Scanned ${scanned} files under ${source}.\n` +
        "   Expected markers: " +
        FULL_HANDLER_MARKERS.map((m) => JSON.stringify(m)).join(", "),
    );
    process.exit(1);
  }
  console.log("  ✅ Benchmark build: testing handler present for harness.");
  process.exit(0);
}

main();
