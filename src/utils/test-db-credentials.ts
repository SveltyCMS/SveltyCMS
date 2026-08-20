/**
 * @file src/utils/test-db-credentials.ts
 * @description
 * Canonical Docker image default credentials for local and CI database testing.
 *
 * Matches official image defaults and a typical Docker Desktop setup:
 * - PostgreSQL: POSTGRES_PASSWORD=postgres → user `postgres`
 * - MariaDB: MARIADB_ROOT_PASSWORD=mariadb → user `root`
 * - MongoDB: no MONGO_INITDB_ROOT_* → no authentication
 */

import { mkdirSync } from "node:fs";
import {
  getLocalSandboxMediaRel,
  getLocalSandboxMediaRoot,
  resolveBenchmarkProfile,
} from "./benchmark-sandbox";

export interface TestDbCredentials {
  user: string;
  password: string;
}

/** Per-adapter defaults aligned with tests/docker-compose.yml image env vars. */
/** Same order as ci.yml db-matrix / db-tests jobs. */
export const INTEGRATION_DB_MATRIX = ["sqlite", "mongodb", "mariadb", "postgresql"] as const;

export type IntegrationDbType = (typeof INTEGRATION_DB_MATRIX)[number];

// NOTE: keep keys canonical — tests/unit/ci/db-credential-parity.test.ts asserts
// every key here appears verbatim in .github/workflows/db-matrix.ts. Aliases
// ("postgres", "mysql") are resolved by normalizeDbType() before lookup.
export const DOCKER_DEFAULT_DB_CREDENTIALS: Record<string, TestDbCredentials> = {
  sqlite: { user: "", password: "" },
  mongodb: { user: "", password: "" },
  postgresql: { user: "postgres", password: "postgres" },
  mariadb: { user: "root", password: "mariadb" },
};

const DB_PORTS: Record<string, string> = {
  sqlite: "",
  mongodb: "27017",
  mariadb: "3306",
  postgresql: "5432",
};

/** Normalizes raw dbType input for reliable key matching (casing, aliases). */
function normalizeDbType(dbType: string = "sqlite"): string {
  const clean = String(dbType || "sqlite")
    .toLowerCase()
    .trim();
  if (clean === "postgres") return "postgresql";
  if (clean === "mysql") return "mariadb"; // MySQL protocol compat — same image family
  return clean;
}

export const getDockerDefaultDbCredentials = (dbType: string): TestDbCredentials => {
  const key = normalizeDbType(dbType);
  return DOCKER_DEFAULT_DB_CREDENTIALS[key] ?? { user: "", password: "" };
};

export const getDefaultDbPort = (dbType: string): string => {
  const key = normalizeDbType(dbType);
  return DB_PORTS[key] ?? "";
};

/** DB name used by integration tests and db-tests CI job. */
export function getIntegrationDbName(dbType: string = "sqlite"): string {
  const normalized = normalizeDbType(dbType);
  return normalized === "sqlite" ? "sveltycms_test.sqlite" : "sveltycms_test";
}

/** DB name used by bench-core CI job (isolated SQLite file for benchmarks). */
export function getBenchmarkDbName(dbType: string = "sqlite"): string {
  const normalized = normalizeDbType(dbType);
  return normalized === "sqlite" ? "benchmark_shared" : getIntegrationDbName(normalized);
}

/**
 * External UDH Postgres connector DB when CMS adapter is postgresql (bench-core matrix).
 * Matches ci.yml `UDH_PG_DATABASE` for `matrix.db == 'postgresql'`.
 */
export const UDH_BENCHMARK_FIXTURE_DB = "sveltycms_udh_fixture";

/** UDH fixture database for bench-core — mirrors ci.yml bench-core env. */
export function getBenchmarkUdhPgDatabase(dbType: string = "sqlite"): string {
  const normalized = normalizeDbType(dbType);
  return normalized === "postgresql" ? UDH_BENCHMARK_FIXTURE_DB : getIntegrationDbName(normalized);
}

/** Env block shared by integration runner invocations (local + CI parity). */
export function getIntegrationTestEnv(
  dbType: string = "sqlite",
  overrides: Record<string, string> = {},
) {
  const normalized = normalizeDbType(dbType);
  const creds = getDockerDefaultDbCredentials(normalized);
  return {
    DB_TYPE: normalized,
    DB_HOST: "127.0.0.1",
    DB_PORT: getDefaultDbPort(normalized),
    DB_NAME: getIntegrationDbName(normalized),
    DB_USER: creds.user,
    DB_PASSWORD: creds.password,
    TEST_MODE: "true",
    PASSWORD_MIN_LENGTH: "8",
    PORT: "4173",
    ...overrides,
  };
}

/** Safely prepares the media sandbox dir (idempotent; env builders stay pure). */
function ensureMediaSandboxDir(): void {
  try {
    const root = getLocalSandboxMediaRoot();
    if (root) {
      mkdirSync(root, { recursive: true });
    }
  } catch {
    /* ignore mkdir races / sandbox permission errors */
  }
}

/** Env block shared by bench-core CI job and local benchmark runners. */
export function getBenchmarkTestEnv(
  dbType: string = "sqlite",
  overrides: Record<string, string> = {},
): Record<string, string> {
  const normalized = normalizeDbType(dbType);
  const creds = getDockerDefaultDbCredentials(normalized);
  const profile = overrides.BENCHMARK_PROFILE ?? resolveBenchmarkProfile();

  // 🏢 THREE MODES (see docs/tests/benchmark-isolation.mdx):
  // - production (default): AUDIT_CHAIN_SYNC=false, DISABLE_AUDIT_LOGS=true
  // - compliance:           AUDIT_CHAIN_SYNC=true,  DISABLE_AUDIT_LOGS=false
  // - e2e/testing:          TEST_MODE=true (separate harness, /api/testing gate)
  const auditMode =
    overrides.BENCHMARK_AUDIT_MODE || process.env.BENCHMARK_AUDIT_MODE || "production";
  const compliance = auditMode === "compliance";

  const env: Record<string, string> = {
    DB_TYPE: normalized,
    DB_HOST: "127.0.0.1",
    DB_PORT: getDefaultDbPort(normalized),
    DB_NAME: process.env.DB_NAME || getBenchmarkDbName(normalized),
    DB_USER: creds.user,
    DB_PASSWORD: creds.password,
    // 🛡️ PRODUCTION PARITY: benchmark servers run NODE_ENV=production without
    // TEST_MODE — real sessions, real rate limits, real WAF, real audits.
    // BENCHMARK stays as a harness marker only (env-only config, sandbox
    // isolation, setup force-complete); it grants NO request-path bypasses.
    NODE_ENV: "production",
    BENCHMARK: "true",
    BENCHMARK_AUDIT_MODE: auditMode,
    AUDIT_CHAIN_SYNC: compliance ? "true" : "false",
    DISABLE_AUDIT_LOGS: compliance ? "false" : "true",
    // Deployment-tuned rate ceilings for load-testing (bucket machinery stays active)
    RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS || "20000",
    RATE_LIMIT_COMMERCE_MAX_REQUESTS: process.env.RATE_LIMIT_COMMERCE_MAX_REQUESTS || "20000",
    SECURITY_RATE_LIMIT_SCALE: process.env.SECURITY_RATE_LIMIT_SCALE || "100",
    // 🛡️ Allow CI to inject randomized secrets; fall back to benchmark defaults for local dev only
    JWT_SECRET_KEY: process.env.JWT_SECRET_KEY || "Benchmark-JWT-Secret-Key-2026-32ch",
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "Benchmark-Encryption-Key-2026-32ch",
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "Password123!",
    BENCHMARK_NO_REDIS: "1",
    BENCHMARK_RECORD: "1",
    PASSWORD_MIN_LENGTH: "8",
    UDH_PG_DATABASE: process.env.UDH_PG_DATABASE || getBenchmarkUdhPgDatabase(normalized),
    BENCHMARK_PROFILE: profile,
    ...overrides,
  };

  // BENCHMARK_AUDIT_MODE overrides passed via `overrides` must win over the
  // derived flags above — re-derive after the spread.
  const finalAuditMode = env.BENCHMARK_AUDIT_MODE || "production";
  const finalCompliance = finalAuditMode === "compliance";
  env.AUDIT_CHAIN_SYNC = finalCompliance ? "true" : "false";
  env.DISABLE_AUDIT_LOGS = finalCompliance ? "false" : "true";

  // Always isolate media under the sandbox for benchmarks (local + ci-fresh).
  // Without this, ci-fresh wizard defaults can leave MEDIA_FOLDER missing/unwritable
  // and HTTP upload warmups fail 8/8.
  if (profile === "local") {
    env.BENCHMARK_LOCAL_SANDBOX = "1";
  }
  if (!env.MEDIA_FOLDER) {
    env.MEDIA_FOLDER = getLocalSandboxMediaRel();
  }

  ensureMediaSandboxDir();

  return env;
}
