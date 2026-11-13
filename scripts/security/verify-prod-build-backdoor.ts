#!/usr/bin/env bun
/**
 * @file scripts/security/verify-prod-build-backdoor.ts
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
 * ### Features:
 * - Handler-marker scan of the SSR output (deploy: must be stripped, bench: must be present)
 * - Client secret scan over `.js/.mjs/.cjs/.html/.json/.map` built from
 *   `ALL_FORBIDDEN_KEYS` (one list shared with `scan-secret-misuse.ts`)
 * - Harness-config value comparison (`config/private.test.ts` only); an absent
 *   harness config is fatal in deploy mode instead of silently scanning nothing
 * - Sourcemap gate: a deploy artifact must not ship any client `.map` files
 * - Import-safe — `main()` only runs when the file is executed directly
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
import { ALL_FORBIDDEN_KEYS } from "./scan-secret-misuse";

const ROOT = process.cwd();
const BUILD_CLIENT_DIR = join(ROOT, "build", "client");
const BUILD_SERVER_DIR = join(ROOT, "build", "server");
const CHUNKS_DIR = join(ROOT, "build", "server", "chunks");
const SK_CLIENT_DIR = join(ROOT, ".svelte-kit", "output", "client");
const SK_SERVER_DIR = join(ROOT, ".svelte-kit", "output", "server");
const SK_CHUNKS_DIR = join(ROOT, ".svelte-kit", "output", "server", "chunks");
const HARNESS_CONFIG_PATH = join(ROOT, "config", "private.test.ts");

/** Client bundles are the leak surface: every text artifact Vite can emit. */
const CLIENT_SCAN_EXTENSIONS = [".js", ".mjs", ".cjs", ".html", ".json", ".map"] as const;
/** Server chunks are only scanned for handler markers — no sourcemaps (they carry source). */
const SERVER_SCAN_EXTENSIONS = [".js", ".mjs", ".cjs"] as const;

export type Mode = "deploy" | "bench";

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

export function getMode(argv: readonly string[] = process.argv): Mode {
  const arg = argv.find((a) => a.startsWith("--mode="))?.split("=")[1];
  return arg === "bench" ? "bench" : "deploy";
}

/**
 * Deploy-grade strictness: an explicit deploy gate, or any build that CI /
 * production will treat as a deploy artifact. Bench mode stays relaxed locally
 * (benchmark builds are not shipped) but not on CI.
 */
export function isDeployStrict(mode: Mode, env: NodeJS.ProcessEnv = process.env): boolean {
  return mode === "deploy" || env.CI === "true" || env.NODE_ENV === "production";
}

/** Per-file handler verdict; the caller aggregates across files. */
export function inspectChunk(content: string): { full: boolean; stub: boolean } {
  return {
    full: FULL_HANDLER_MARKERS.some((m) => content.includes(m)),
    stub: STUB_MARKERS.some((m) => content.includes(m)),
  };
}

/** Collect files under `dir` whose name ends in one of `extensions`, recursively. */
export function collectFiles(
  dir: string,
  extensions: readonly string[],
  out: string[] = [],
): string[] {
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
      collectFiles(full, extensions, out);
    } else if (st.isFile() && extensions.some((ext) => name.endsWith(ext))) {
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
    const verdict = inspectChunk(content);
    full ||= verdict.full;
    stub ||= verdict.stub;
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
    ...collectFiles(BUILD_SERVER_DIR, SERVER_SCAN_EXTENSIONS),
    // Entry wrappers occasionally carry re-exports / markers
    ...["index.js", "handler.js"].map((f) => join(ROOT, "build", f)).filter((p) => existsSync(p)),
  ];

  let result = { ...scanFiles(buildFiles), source: BUILD_SERVER_DIR };

  // Fall back to SvelteKit pre-adapter SSR output when adapter dir is empty/sparse.
  if (result.scanned === 0 || (!result.full && !result.stub)) {
    const skFiles = collectFiles(SK_SERVER_DIR, SERVER_SCAN_EXTENSIONS);
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

/**
 * Client bundles must never carry private-config secrets.
 *
 * Server-side secrets (JWT, encryption keys, DB credentials) live in
 * `config/private.ts`; a client chunk that contains their names or values means
 * the server config module leaked into the browser graph — trivially readable by
 * any visitor. Values are compared against the harness config only
 * (`config/private.test.ts`), never against the live file (private-config policy),
 * and are never printed.
 */
const SECRET_KEY_RE = /(SECRET|PASSWORD|PASS|TOKEN|_KEY)\b/i;
const CONFIG_ASSIGNMENT_RE =
  /^\s*(?:"([A-Z0-9_]+)"|'([A-Z0-9_]+)'|([A-Z0-9_]+))\s*:\s*["']([^"']{8,})["']/gm;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A secret key used as an object key with a literal value — the shape an inlined
 * private-config module has after minification (`JWT_SECRET_KEY:"…"`). Bare
 * mentions of the name are legitimate: the System Settings UI lists them as
 * editable setting keys (`{key:"JWT_SECRET_KEY",label:…}` in settings-groups.ts).
 * Every key from `ALL_FORBIDDEN_KEYS` is covered, so a new secret cannot ship
 * unscanned just because this list was not updated.
 */
export function buildSecretLiteralRe(keys: readonly string[] = ALL_FORBIDDEN_KEYS): RegExp {
  const names = keys.map(escapeRegExp).join("|");
  return new RegExp(`\\b(?:${names})\\b\\s*[:=]\\s*["'\`][^"'\`]{6,}["'\`]`);
}

export const SECRET_LITERAL_RE = buildSecretLiteralRe();

export interface SecretLeak {
  file: string;
  what: string;
}

export interface HarnessSecret {
  key: string;
  value: string;
}

export interface HarnessSecrets {
  secrets: HarnessSecret[];
  /** False when `config/private.test.ts` is absent — the scan is then name-shape only. */
  present: boolean;
}

export function readHarnessSecrets(configPath: string = HARNESS_CONFIG_PATH): HarnessSecrets {
  if (!existsSync(configPath)) return { secrets: [], present: false };
  const secrets: HarnessSecret[] = [];
  for (const m of readFileSync(configPath, "utf8").matchAll(CONFIG_ASSIGNMENT_RE)) {
    const key = m[1] ?? m[2] ?? m[3] ?? "";
    const value = m[4] ?? "";
    if (!value.trim() || value.trim().length < 8) continue;
    // Only secret-shaped VALUES are worth comparing against client bundles;
    // bootstrap keys such as DB_NAME/DB_TYPE are public configuration.
    if (SECRET_KEY_RE.test(key)) secrets.push({ key, value });
  }
  return { secrets, present: true };
}

/** Scan already-collected client files for harness values and secret-key literals. */
export function findSecretLeaks(
  files: readonly string[],
  secrets: readonly HarnessSecret[],
  rootLabel: string = ROOT,
): SecretLeak[] {
  const leaks: SecretLeak[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const rel = file.replace(rootLabel, "").replace(/\\/g, "/").replace(/^\/+/, "") || file;

    // One finding per file: a leaked value is often ALSO an inlined literal, and
    // repeating the same file for every reason buries the rest of the report.
    const reasons = new Set<string>();
    for (const { key, value } of secrets) {
      if (content.includes(value)) reasons.add(`${key} value`);
    }
    // Inlined config literal (name + value) — see SECRET_LITERAL_RE.
    const literal = content.match(SECRET_LITERAL_RE);
    if (literal) {
      const name = literal[0].replace(/\s*[:=]\s*["'`][^"'`]*["'`]$/, "");
      reasons.add(`${name} literal`);
    }
    if (reasons.size > 0) leaks.push({ file: rel, what: [...reasons].join(", ") });
  }
  return leaks;
}

export interface ClientSecretScanResult {
  leaks: SecretLeak[];
  /** Fatal gate message — deploy mode cannot prove the bundles are value-free. */
  error: string | null;
  /** Non-fatal note (bench/dev) explaining the reduced scan. */
  warning: string | null;
}

/**
 * Deploy mode is fail-closed: without the harness config there is no reference
 * value set, so "no leaks found" would be a false clean. Bench/dev keeps the
 * name-shape scan (SECRET_LITERAL_RE) and warns about the reduced coverage.
 */
export function clientSecretScan(
  files: readonly string[],
  harness: HarnessSecrets,
  mode: Mode,
  rootLabel: string = ROOT,
): ClientSecretScanResult {
  const leaks = findSecretLeaks(files, harness.secrets, rootLabel);
  if (harness.present) return { leaks, error: null, warning: null };

  const why = "config/private.test.ts is missing — leaked private-config VALUES cannot be detected";
  if (mode === "deploy") {
    return {
      leaks,
      warning: null,
      error:
        `❌ ${why}.\n` +
        "   Generate it with the integration/E2E harness (or the TEST_MODE setup wizard), " +
        "then re-run the deploy gate.",
    };
  }
  return {
    leaks,
    error: null,
    warning: `⚠️  ${why} (non-deploy mode: scanning key-name literals only).`,
  };
}

function scanClientForSecrets(mode: Mode): ClientSecretScanResult {
  const files = [BUILD_CLIENT_DIR, SK_CLIENT_DIR].flatMap((dir) =>
    collectFiles(dir, CLIENT_SCAN_EXTENSIONS),
  );
  return clientSecretScan(files, readHarnessSecrets(), mode);
}

/** Every `.map` file under `dir` (recursive) — deploy artifacts must have none. */
export function findSourcemaps(dir: string): string[] {
  return collectFiles(dir, [".map"]);
}

/** True when the artifact must not carry sourcemaps (deploy gate, CI, production). */
export function sourcemapGateFails(
  mapCount: number,
  mode: Mode,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return mapCount > 0 && isDeployStrict(mode, env);
}

function reportSourcemaps(mode: Mode): boolean {
  const maps = findSourcemaps(BUILD_CLIENT_DIR);
  if (maps.length === 0) {
    console.log("  ✅ No client sourcemaps in the build.");
    return true;
  }
  if (!sourcemapGateFails(maps.length, mode)) {
    console.log(`  ℹ️  ${maps.length} client sourcemap(s) present (non-deploy build — allowed).`);
    return true;
  }
  console.error(`❌ ${maps.length} sourcemap file(s) found under ${BUILD_CLIENT_DIR}:`);
  for (const map of maps.slice(0, 10)) {
    console.error(`   ${map.replace(ROOT, "").replace(/\\/g, "/").replace(/^\/+/, "")}`);
  }
  console.error(
    "   A deploy artifact must not ship .map files — they expose the full server-client source incl. private-config wiring.\n" +
      "   Rebuild with: BUILD_SOURCEMAP=false bun run build   (or: bun run build:fast)",
  );
  return false;
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
    if (!reportClientSecretScan(mode)) process.exit(1);
    if (!reportSourcemaps(mode)) process.exit(1);
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
  if (!reportClientSecretScan(mode)) process.exit(1);
  if (!reportSourcemaps(mode)) process.exit(1);
  process.exit(0);
}

/** Shared by both modes: the browser must never see private-config secrets. */
function reportClientSecretScan(mode: Mode): boolean {
  const { leaks, error, warning } = scanClientForSecrets(mode);
  if (warning) console.warn(warning);
  if (error) {
    console.error(error);
    return false;
  }
  if (leaks.length === 0) {
    console.log("  ✅ Client bundles carry no private-config names or values.");
    return true;
  }
  console.error("❌ Private-config secrets detected in client bundles:");
  for (const leak of leaks.slice(0, 20)) {
    console.error(`   ${leak.file} → ${leak.what}`);
  }
  console.error(
    "   Fix: keep secret-bearing modules server-only (.server.ts) — client code must " +
      "read public settings through $env / publicEnv instead.",
  );
  return false;
}

if (import.meta.main) main();
