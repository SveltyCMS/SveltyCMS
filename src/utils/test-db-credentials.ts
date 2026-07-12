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

export interface TestDbCredentials {
  user: string;
  password: string;
}

/** Per-adapter defaults aligned with tests/docker-compose.yml image env vars. */
/** Same order as ci.yml db-matrix / db-tests jobs. */
export const INTEGRATION_DB_MATRIX = ["sqlite", "mongodb", "mariadb", "postgresql"] as const;

export type IntegrationDbType = (typeof INTEGRATION_DB_MATRIX)[number];

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

export function getDockerDefaultDbCredentials(dbType: string): TestDbCredentials {
  return DOCKER_DEFAULT_DB_CREDENTIALS[dbType] ?? { user: "", password: "" };
}

export function getDefaultDbPort(dbType: string): string {
  return DB_PORTS[dbType] ?? "";
}

/** DB name used by integration tests and db-tests CI job. */
export function getIntegrationDbName(): string {
  return "sveltycms_test";
}

/** DB name used by bench-core CI job (isolated SQLite file for benchmarks). */
export function getBenchmarkDbName(dbType: string): string {
  return dbType === "sqlite" ? "benchmark_shared" : getIntegrationDbName();
}

/**
 * External UDH Postgres connector DB when CMS adapter is postgresql (bench-core matrix).
 * Matches ci.yml `UDH_PG_DATABASE` for `matrix.db == 'postgresql'`.
 */
export const UDH_BENCHMARK_FIXTURE_DB = "sveltycms_udh_fixture";

/** UDH fixture database for bench-core — mirrors ci.yml bench-core env. */
export function getBenchmarkUdhPgDatabase(dbType: string): string {
  return dbType === "postgresql" ? UDH_BENCHMARK_FIXTURE_DB : getIntegrationDbName();
}

/** Env block shared by integration runner invocations (local + CI parity). */
export function getIntegrationTestEnv(dbType: string, overrides: Record<string, string> = {}) {
  const creds = getDockerDefaultDbCredentials(dbType);
  return {
    DB_TYPE: dbType,
    DB_HOST: "127.0.0.1",
    DB_PORT: getDefaultDbPort(dbType),
    DB_NAME: getIntegrationDbName(),
    DB_USER: creds.user,
    DB_PASSWORD: creds.password,
    TEST_MODE: "true",
    PASSWORD_MIN_LENGTH: "8",
    PORT: "4173",
    ...overrides,
  };
}

/** Env block shared by bench-core CI job and local benchmark runners. */
export function getBenchmarkTestEnv(
  dbType: string,
  overrides: Record<string, string> = {},
): Record<string, string> {
  const creds = getDockerDefaultDbCredentials(dbType);
  const { resolveBenchmarkProfile, getLocalSandboxMediaRel } =
    require("./benchmark-sandbox") as typeof import("./benchmark-sandbox");

  const profile = overrides.BENCHMARK_PROFILE ?? resolveBenchmarkProfile();

  const env: Record<string, string> = {
    DB_TYPE: dbType,
    DB_HOST: "127.0.0.1",
    DB_PORT: getDefaultDbPort(dbType),
    DB_NAME: process.env.DB_NAME || getBenchmarkDbName(dbType),
    DB_USER: creds.user,
    DB_PASSWORD: creds.password,
    TEST_MODE: "true",
    BENCHMARK: "true",
    JWT_SECRET_KEY: "Benchmark-JWT-Secret-Key-2026-32ch",
    ENCRYPTION_KEY: "Benchmark-Encryption-Key-2026-32ch",
    BENCHMARK_NO_REDIS: "1",
    BENCHMARK_RECORD: "1",
    ADMIN_PASSWORD: "Password123!",
    PASSWORD_MIN_LENGTH: "8",
    UDH_PG_DATABASE: process.env.UDH_PG_DATABASE || getBenchmarkUdhPgDatabase(dbType),
    BENCHMARK_PROFILE: profile,
    ...overrides,
  };

  if (profile === "local") {
    env.BENCHMARK_LOCAL_SANDBOX = "1";
    env.MEDIA_FOLDER = getLocalSandboxMediaRel();
  }

  return env;
}
