/**
 * @file src/utils/benchmark-sandbox.ts
 * @description Isolation contract for local benchmarks vs CI-fresh install benchmarks.
 *
 * **Local** (`config/private.ts` exists): runtime uses env-only config (`BENCHMARK=true`),
 * isolated SQLite (`benchmark_shared`), sandbox compiled/manifest/media trees — live developer
 * data under `/config` and `.compiledCollections` root must never be written.
 *
 * **CI-fresh** (no `config/private.ts`, mirrors `.github/workflows/ci.yml` bench-core):
 * full setup wizard; writes `private.test.ts` under `TEST_MODE`; simulates first install.
 *
 * ### Features:
 * - profile resolution (`local` | `ci-fresh`)
 * - sandbox path helpers for compiled output, media and Config-Sync exports
 * - fail-closed live-data write guard
 */

import fs from "node:fs";
import path from "node:path";
import { paths } from "./path-resolver.ts";
import { isAutomatedTestHarness, isCiRunner } from "./private-config-policy.ts";
import { isIsolatedTestDbName } from "./test-db-safety.ts";

export type BenchmarkProfile = "local" | "ci-fresh";

const SANDBOX_COMPILED_ROOT = path.relative(paths.root, paths.benchmark.sandboxCompiled);
const SANDBOX_MEDIA_REL = path
  .relative(paths.root, paths.benchmark.sandboxMedia)
  .replace(/\\/g, "/");
const SANDBOX_CONFIG_SYNC_ROOT = path.relative(paths.root, paths.benchmark.sandboxConfigSync);

/** Inlined from test-db-credentials to break circular dependency (benchmark-sandbox ↔ test-db-credentials). */
function getBenchmarkSandboxDbName(dbType: string): string {
  return dbType === "sqlite" ? "benchmark_shared" : "sveltycms_test";
}

/** True when a benchmark server/process is active. */
export function isBenchmarkActive(): boolean {
  return process.env.BENCHMARK === "true" || process.env.BENCHMARK === "1";
}

/** Whether the developer has completed local setup (`config/private.ts`). */
export function developerPrivateConfigExists(): boolean {
  return fs.existsSync(path.join(process.cwd(), "config", "private.ts"));
}

/**
 * Resolves benchmark profile.
 * Explicit `BENCHMARK_PROFILE` wins; otherwise `private.ts` presence selects local vs CI-fresh.
 */
export function resolveBenchmarkProfile(): BenchmarkProfile {
  const explicit = process.env.BENCHMARK_PROFILE;
  if (explicit === "local" || explicit === "ci-fresh") return explicit;
  return developerPrivateConfigExists() ? "local" : "ci-fresh";
}

/** Local developer machine — live `/config` must remain untouched. */
export function isLocalBenchmarkSandbox(): boolean {
  return isBenchmarkActive() && resolveBenchmarkProfile() === "local";
}

/** CI / clean tree — run setup wizard like first install. */
export function isCiFreshBenchmark(): boolean {
  return isBenchmarkActive() && resolveBenchmarkProfile() === "ci-fresh";
}

/** Isolated compiled collections + manifest root for local benchmarks. */
export function getLocalSandboxCompiledRoot(tenantId?: string | null): string {
  const base = path.resolve(process.cwd(), SANDBOX_COMPILED_ROOT);
  if (tenantId === undefined) return base;
  const tenant = tenantId === null ? "global" : tenantId;
  return path.join(base, tenant);
}

/** Isolated media directory for local benchmarks (relative path for settings). */
export function getLocalSandboxMediaRel(): string {
  return SANDBOX_MEDIA_REL.replace(/\\/g, "/");
}

export function getLocalSandboxMediaRoot(): string {
  return path.resolve(process.cwd(), SANDBOX_MEDIA_REL);
}

/** Isolated Config-Sync export root for local benchmarks (mirrors `test-media`). */
export function getLocalSandboxConfigSyncRoot(): string {
  return path.resolve(process.cwd(), SANDBOX_CONFIG_SYNC_ROOT);
}

/**
 * Config-Sync export root (`ConfigService.performExport`).
 *
 * Precedence: explicit `SVELTY_CONFIG_SYNC_DIR` → sandbox during a local
 * benchmark → live `config/sync`. The same shape as
 * `resolveCompiledCollectionsPath()`, so a benchmark (`config-promotion`) that
 * exports once per iteration can no longer mint ~40 `config/sync/export_*`
 * folders in the developer's project on every run.
 */
export function resolveConfigSyncRoot(): string {
  const explicit = process.env.SVELTY_CONFIG_SYNC_DIR;
  if (explicit) return path.resolve(process.cwd(), explicit);
  if (isLocalBenchmarkSandbox()) return getLocalSandboxConfigSyncRoot();
  return paths.configSync;
}

/** 🛡️ Hardened: live roots re-resolved each call so chdir/tests stay correct */
function getLiveRoots(): string[] {
  // Always protect BOTH live private.ts and private.test.ts — under automated
  // harnesses paths.privateConfig resolves to private.test.ts only, which would
  // leave the real developer private.ts writable without privateConfigLive.
  return [
    paths.privateConfigLive,
    paths.privateConfigTest,
    paths.privateConfig,
    paths.collections,
    paths.compiledCollections,
    paths.database,
    paths.media,
    paths.configSync,
  ].map((p) => path.normalize(p));
}

function liveCompiledCollectionsPath(tenantId?: string | null): string {
  const base = path.join(process.cwd(), ".compiledCollections");
  if (tenantId === undefined || tenantId === null || tenantId === "global") return base;
  return path.join(base, tenantId);
}

/** True under the Playwright/E2E harness, which deliberately uses the live `config/collections`. */
export function isPlaywrightTest(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PLAYWRIGHT_TEST === "true" || env.PLAYWRIGHT_TEST === "1";
}

/**
 * Whether the live-data write guard is active.
 *
 * Local benchmarks AND all automated harnesses (vitest / `bun test` /
 * integration / Playwright E2E) must never write to the developer's live
 * `config/private.ts`, `config/collections`, `config/database`, or root
 * `.compiledCollections` (outside `.compiledCollections/test-collections`).
 */
function guardIsActive(): boolean {
  if (isLocalBenchmarkSandbox()) return true;
  return isAutomatedTestHarness();
}

function isSameOrInside(target: string, root: string): boolean {
  const normalizedRoot = path.normalize(root);
  return target === normalizedRoot || target.startsWith(normalizedRoot + path.sep);
}

/**
 * Compiled collections output directory — redirects to sandbox when local benchmark active.
 */
export function resolveCompiledCollectionsPath(tenantId?: string | null): string {
  if (isLocalBenchmarkSandbox()) {
    return getLocalSandboxCompiledRoot(tenantId);
  }
  // Every automated harness (unit/integration/E2E/benchmark) compiles under the
  // test-owned root, never the live `.compiledCollections` tree. The manifest is
  // written beside the output, so this also keeps the live manifest untouched.
  if (isAutomatedTestHarness()) {
    const base = path.join(process.cwd(), ".compiledCollections", "test-collections");
    if (tenantId === undefined || tenantId === null || tenantId === "global") return base;
    return path.join(base, path.basename(tenantId));
  }
  return liveCompiledCollectionsPath(tenantId);
}

/**
 * Fail-closed guard: throws before writing to live developer trees during local
 * benchmarks and automated test harnesses (`config/private.ts`, `config/collections`,
 * `config/database`, and root `.compiledCollections` outside `test-collections`).
 */
export function assertLiveDataWriteAllowed(targetPath: string): void {
  if (!guardIsActive()) return;

  const normalizedTarget = path.normalize(path.resolve(targetPath));

  // 1. Allow sandbox paths
  const sandboxCompiled = getLocalSandboxCompiledRoot();
  const sandboxMedia = getLocalSandboxMediaRoot();
  const sandboxConfigSync = getLocalSandboxConfigSyncRoot();

  if (
    isSameOrInside(normalizedTarget, sandboxCompiled) ||
    isSameOrInside(normalizedTarget, sandboxMedia) ||
    isSameOrInside(normalizedTarget, sandboxConfigSync)
  ) {
    return;
  }

  // 2. Allow the sanctioned test collection, test database, and test compiled trees
  const cwd = process.cwd();
  const testCollections = path.join(cwd, "config", "test-collections");
  const legacyTestDir = path.join(cwd, "config", "collections", "test");
  const testDatabase = path.join(cwd, "config", "test-database");
  const testCompiled = path.join(cwd, ".compiledCollections", "test-collections");
  if (
    isSameOrInside(normalizedTarget, testCollections) ||
    isSameOrInside(normalizedTarget, legacyTestDir) ||
    isSameOrInside(normalizedTarget, testDatabase) ||
    (!isLocalBenchmarkSandbox() && isSameOrInside(normalizedTarget, testCompiled))
  ) {
    return;
  }

  // 3. Local benchmark — block every live root (including private.test.ts)
  if (isLocalBenchmarkSandbox()) {
    for (const root of getLiveRoots()) {
      if (isSameOrInside(normalizedTarget, root)) {
        throw new Error(
          `[BenchmarkSandbox] SECURITY VIOLATION: Attempted write to live data at '${path.relative(cwd, normalizedTarget)}'. ` +
            `Use sandbox paths under ${SANDBOX_COMPILED_ROOT} or ${SANDBOX_MEDIA_REL}.`,
        );
      }
    }
    return;
  }

  // 4. Automated test harness (unit / integration / E2E):
  //    Allow `config/private.test.ts` (and `config/private.ts` ONLY on ephemeral CI runners).
  //    Block writes to live `config/private.ts`, `config/collections`, `config/database`,
  //    and root `.compiledCollections` (outside `.compiledCollections/test-collections`).
  const livePrivate = path.normalize(paths.privateConfigLive);
  if (!isCiRunner() && isSameOrInside(normalizedTarget, livePrivate)) {
    throw new Error(
      `[BenchmarkSandbox] SECURITY VIOLATION: automated harness attempted to write live config/private.ts at '${path.relative(cwd, normalizedTarget)}'. ` +
        "Tests must write config/private.test.ts only.",
    );
  }

  const liveSource = path.normalize(paths.collections);
  if (isSameOrInside(normalizedTarget, liveSource)) {
    throw new Error(
      `[BenchmarkSandbox] SECURITY VIOLATION: automated harness attempted to write live collections at '${path.relative(cwd, normalizedTarget)}'. ` +
        "Tests must write under config/test-collections (or config/collections/test).",
    );
  }

  const liveDatabase = path.normalize(paths.database);
  if (isSameOrInside(normalizedTarget, liveDatabase)) {
    throw new Error(
      `[BenchmarkSandbox] SECURITY VIOLATION: automated harness attempted to write live database directory at '${path.relative(cwd, normalizedTarget)}'. ` +
        "Tests must write under config/test-database.",
    );
  }

  const liveCompiled = path.normalize(paths.compiledCollections);
  if (isSameOrInside(normalizedTarget, liveCompiled)) {
    throw new Error(
      `[BenchmarkSandbox] SECURITY VIOLATION: automated harness attempted to write live .compiledCollections at '${path.relative(cwd, normalizedTarget)}'. ` +
        "Tests must compile under .compiledCollections/test-collections.",
    );
  }
}

/**
 * Fail-closed pre-flight for anything that runs a benchmark server.
 *
 * The write guard above only protects the call sites it is wired into; this
 * check stops a run before the server (or its workers) can resolve a live
 * path at all. It is intentionally env-only and synchronous:
 *
 * - `DB_NAME` must be an isolation-owned name. `resolveSqlitePath()` uses the
 *   same classifier, so an isolated name also routes the SQLite file to
 *   `config/test-database/` instead of `config/database/`.
 * - `MEDIA_FOLDER` / `SVELTY_CONFIG_SYNC_DIR` / a path-shaped `DB_HOST` must
 *   not resolve inside the developer's live trees.
 */
export function assertBenchmarkIsolation(
  env: NodeJS.ProcessEnv = process.env,
  rootDir: string = process.cwd(),
): void {
  const dbName = env.DB_NAME?.trim() ?? "";
  if (!dbName) {
    throw new Error(
      "[BenchmarkSandbox] DB_NAME is not set. A benchmark must declare an isolated database (e.g. benchmark_shared); refusing to run against the default/live database.",
    );
  }
  if (!isIsolatedTestDbName(dbName)) {
    throw new Error(
      `[BenchmarkSandbox] DB_NAME='${dbName}' is not an isolated test/benchmark database. Live user data must never be used by a benchmark.`,
    );
  }

  const assertOutsideLive = (key: string, value: string | undefined, liveRoots: string[]) => {
    const raw = value?.trim();
    if (!raw) return;
    const target = path.normalize(path.resolve(rootDir, raw));
    for (const liveRoot of liveRoots) {
      if (isSameOrInside(target, path.normalize(path.resolve(rootDir, liveRoot)))) {
        throw new Error(
          `[BenchmarkSandbox] ${key}='${raw}' resolves inside live data (${liveRoot}). Benchmarks must use the sandbox roots from getLocalSandboxMediaRoot()/getLocalSandboxConfigSyncRoot().`,
        );
      }
    }
  };

  assertOutsideLive("MEDIA_FOLDER", env.MEDIA_FOLDER, [
    path.join(rootDir, "mediaFolder"),
    path.join(rootDir, "media"),
  ]);
  assertOutsideLive("SVELTY_CONFIG_SYNC_DIR", env.SVELTY_CONFIG_SYNC_DIR, [
    path.join(rootDir, "config", "sync"),
  ]);

  // A SQLite host is a directory; network addresses (localhost / IPs) are not.
  const host = env.DB_HOST?.trim();
  const isNetworkHost = !host || host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
  if (!isNetworkHost) {
    assertOutsideLive("DB_HOST", host, [path.join(rootDir, "config", "database")]);
  }
}

export interface BenchmarkIsolationSummary {
  profile: BenchmarkProfile;
  dbName: string;
  compiledRoot: string;
  mediaRoot: string;
  configSyncRoot: string;
  liveConfigProtected: boolean;
}

/** Resolved isolation paths for operator visibility (local profile only). */
export function getBenchmarkIsolationSummary(dbType = "sqlite"): BenchmarkIsolationSummary {
  const profile = resolveBenchmarkProfile();
  return {
    profile,
    dbName: process.env.DB_NAME || getBenchmarkSandboxDbName(dbType),
    compiledRoot: resolveCompiledCollectionsPath(null),
    mediaRoot: profile === "local" ? getLocalSandboxMediaRoot() : "(live media settings)",
    configSyncRoot: profile === "local" ? getLocalSandboxConfigSyncRoot() : paths.configSync,
    liveConfigProtected: profile === "local",
  };
}

/** Prints sandbox boundaries at benchmark startup (local profile). */
/**
 * Fail-closed: local benchmarks must use the isolated benchmark DB, not live private.ts DB_NAME.
 */
export function assertBenchmarkDbIsolation(dbType = "sqlite"): void {
  if (!isLocalBenchmarkSandbox()) return;

  const expected = process.env.DB_NAME || getBenchmarkSandboxDbName(dbType);
  const forbiddenLive = developerPrivateConfigExists()
    ? (() => {
        try {
          const live = fs.readFileSync(path.join(process.cwd(), "config", "private.ts"), "utf8");
          return live.match(/DB_NAME\s*:\s*['"`]([^'"`]+)['"`]/)?.[1];
        } catch {
          return undefined;
        }
      })()
    : undefined;

  if (forbiddenLive && expected === forbiddenLive) {
    throw new Error(
      `[BenchmarkSandbox] DB_NAME '${expected}' matches live config/private.ts. ` +
        `Benchmarks must use isolated DB '${getBenchmarkSandboxDbName(dbType)}'.`,
    );
  }
}

export function printBenchmarkIsolationBanner(dbType = "sqlite"): void {
  assertBenchmarkDbIsolation(dbType);
  const summary = getBenchmarkIsolationSummary(dbType);
  console.log(`  Benchmark profile: ${summary.profile}`);
  if (summary.profile === "local") {
    console.log("  🛡️  Live data isolation (fail-closed writes):");
    console.log(`     config/private.ts     → read-only (BENCHMARK env-only runtime)`);
    console.log(`     database              → ${summary.dbName}`);
    console.log(`     compiled/manifest     → ${summary.compiledRoot}`);
    console.log(`     media                 → ${summary.mediaRoot}`);
    console.log(`     config sync           → ${summary.configSyncRoot}`);
    console.log("     external services     → Redis/SMTP/AI/webhooks disabled (BENCHMARK mode)");
  } else {
    console.log("  🧪 CI-fresh mode: setup wizard simulates first install (private.test.ts only)");
    console.log(`     database              → ${summary.dbName}`);
  }
}
