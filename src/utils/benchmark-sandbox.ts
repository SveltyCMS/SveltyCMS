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
 * - sandbox path helpers for compiled output and media
 * - fail-closed live-data write guard
 */

import fs from "node:fs";
import path from "node:path";

export type BenchmarkProfile = "local" | "ci-fresh";

const SANDBOX_COMPILED_ROOT = path.join(".compiledCollections", "test", "_local_sandbox");
const SANDBOX_MEDIA_REL = path.join("config", "benchmark-sandbox", "media");

/** Inlined from test-db-credentials to break circular dependency (benchmark-sandbox ↔ test-db-credentials). */
function getBenchmarkSandboxDbName(dbType: string): string {
  return dbType === "sqlite" ? "benchmark_shared" : "sveltycms_test";
}

/** True when a benchmark server/process is active. */
export function isBenchmarkActive(): boolean {
  return (
    process.env.BENCHMARK === "true" ||
    process.env.SVELTY_BENCHMARK_SUITE === "true" ||
    process.env.BENCHMARK_MODE === "true" ||
    process.env.BENCHMARK_MODE === "1"
  );
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

function liveCompiledCollectionsPath(tenantId?: string | null): string {
  const base = path.join(process.cwd(), ".compiledCollections");
  // null (super-tenant) and undefined (no tenant) both use root compiled dir
  if (tenantId === undefined || tenantId === null) return base;
  return path.join(base, tenantId);
}

/**
 * Compiled collections output directory — redirects to sandbox when local benchmark active.
 */
export function resolveCompiledCollectionsPath(tenantId?: string | null): string {
  if (isLocalBenchmarkSandbox()) {
    return getLocalSandboxCompiledRoot(tenantId);
  }
  return liveCompiledCollectionsPath(tenantId);
}

/**
 * Fail-closed guard: throws before writing to live developer trees during local benchmarks.
 */
export function assertLiveDataWriteAllowed(targetPath: string): void {
  if (!isLocalBenchmarkSandbox()) return;

  const normalized = path.normalize(path.resolve(targetPath));
  const cwd = path.resolve(process.cwd());
  const sandboxCompiled = getLocalSandboxCompiledRoot();
  const sandboxMedia = getLocalSandboxMediaRoot();

  if (
    normalized === sandboxCompiled ||
    normalized.startsWith(sandboxCompiled + path.sep) ||
    normalized === sandboxMedia ||
    normalized.startsWith(sandboxMedia + path.sep)
  ) {
    return;
  }

  if (normalized.includes("benchmark_shared")) return;

  const testCollections = path.join(cwd, "config", "collections", "test");
  if (normalized === testCollections || normalized.startsWith(testCollections + path.sep)) {
    return;
  }

  const liveRoots = [
    path.join(cwd, "config", "private.ts"),
    path.join(cwd, "config", "collections"),
    path.join(cwd, ".compiledCollections"),
    path.join(cwd, "mediaFolder"),
    path.join(cwd, "config", "database", "sveltycms.db"),
    path.join(cwd, "config", "database", "sveltycms_test.sqlite"),
  ];

  for (const root of liveRoots) {
    if (normalized === root || normalized.startsWith(root + path.sep)) {
      throw new Error(
        `[BenchmarkSandbox] Blocked write to live data: ${path.relative(cwd, normalized)}. ` +
          `Use sandbox paths under ${SANDBOX_COMPILED_ROOT} or ${SANDBOX_MEDIA_REL}.`,
      );
    }
  }
}

/** Env augmentations for local sandbox isolation (merged into benchmark test env). */
export function getLocalSandboxEnvOverrides(): Record<string, string> {
  if (!isLocalBenchmarkSandbox()) return {};
  return {
    BENCHMARK_PROFILE: "local",
    BENCHMARK_LOCAL_SANDBOX: "1",
    MEDIA_FOLDER: getLocalSandboxMediaRel(),
  };
}

/** Env augmentations for CI-fresh first-install benchmarks. */
export function getCiFreshBenchmarkEnvOverrides(): Record<string, string> {
  if (!isCiFreshBenchmark()) return { BENCHMARK_PROFILE: resolveBenchmarkProfile() };
  return { BENCHMARK_PROFILE: "ci-fresh" };
}

export interface BenchmarkIsolationSummary {
  profile: BenchmarkProfile;
  dbName: string;
  compiledRoot: string;
  mediaRoot: string;
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
    console.log("     external services     → Redis/SMTP/AI/webhooks disabled (BENCHMARK mode)");
  } else {
    console.log("  🧪 CI-fresh mode: setup wizard simulates first install (private.test.ts only)");
    console.log(`     database              → ${summary.dbName}`);
  }
}
