/**
 * @file scripts\benchmark-matrix\config.ts
 * @description Configuration file for the benchmark matrix tool.
 */

import path from "node:path";
import type { DatabaseConfig } from "./types";

// --- PERFORMANCE BUDGETS ---
export const PERFORMANCE_BUDGET = {
  coldStartMs: 5_000,
  collections: 150,
  graphqlAvg: 100,
  dbRaw: 50,
  hooks: 1.5,
  memGrowth: 60,
  securityMs: 25,
  openapiHit: 10,
  buildDuration: 80000,
  bundleSizeTotal: 25,
} as const;

// --- DATABASE METADATA ---
export const DB_METADATA = {
  sqlite: {
    label: "SQLITE",
    icon: "🗄️ ",
    color: "\x1b[34m",
    brandColor: "#003b57",
  },
  "sqlite-redis": {
    label: "SQLITE+REDIS",
    icon: "⚡",
    color: "\x1b[36m",
    brandColor: "#00a3cc",
  },
  mongodb: {
    label: "MONGODB",
    icon: "🍃",
    color: "\x1b[32m",
    brandColor: "#47A248",
  },
  "mongodb-redis": {
    label: "MONGODB+REDIS",
    icon: "🔥",
    color: "\x1b[32m",
    brandColor: "#13aa52",
  },
  postgresql: {
    label: "POSTGRESQL",
    icon: "🐘",
    color: "\x1b[35m",
    brandColor: "#336791",
  },
  "postgresql-redis": {
    label: "POSTGRESQL+REDIS",
    icon: "💎",
    color: "\x1b[35m",
    brandColor: "#61b9fb",
  },
  mariadb: {
    label: "MARIADB",
    icon: "🐬",
    color: "\x1b[33m",
    brandColor: "#003545",
  },
  "mariadb-redis": {
    label: "MARIADB+REDIS",
    icon: "🔱",
    color: "\x1b[33m",
    brandColor: "#c0ad7f",
  },
} as const;

export const DB_ORDER = [
  "sqlite",
  "sqlite-redis",
  "mongodb",
  "mongodb-redis",
  "postgresql",
  "postgresql-redis",
  "mariadb",
  "mariadb-redis",
] as const;

export const ALL_DATABASES: DatabaseConfig[] = [
  {
    type: "sqlite",
    port: 4173,
    host: "./config/database",
    user: "",
    password: "",
  },
  {
    type: "sqlite",
    port: 4173,
    host: "./config/database",
    user: "",
    password: "",
    useRedis: true,
    label: "SQLITE+REDIS",
  },
  { type: "mongodb", port: 27017, host: "127.0.0.1", user: "", password: "" },
  {
    type: "mongodb",
    port: 27017,
    host: "127.0.0.1",
    user: "",
    password: "",
    useRedis: true,
    label: "MONGODB+REDIS",
  },
  {
    type: "postgresql",
    port: 5432,
    host: "127.0.0.1",
    user: "postgres",
    password: "postgres",
  },
  {
    type: "postgresql",
    port: 5432,
    host: "127.0.0.1",
    user: "postgres",
    password: "postgres",
    useRedis: true,
    label: "POSTGRESQL+REDIS",
  },
  {
    type: "mariadb",
    port: 3306,
    host: "127.0.0.1",
    user: "root",
    password: "mariadb",
  },
  {
    type: "mariadb",
    port: 3306,
    host: "127.0.0.1",
    user: "root",
    password: "mariadb",
    useRedis: true,
    label: "MARIADB+REDIS",
  },
];

// --- NETWORK & PORTS ---
export const PORT_BASE = 4173;
export const SETUP_PORT_OFFSET = 99;
export const HEALING_PORT_OFFSET = 99;

/** Helper to get worker port based on index */
export const getWorkerPort = (index: number) => PORT_BASE + index;
/** Helper to get setup port */
export const getSetupPort = () => PORT_BASE + SETUP_PORT_OFFSET;
/** Helper to get healing port */
export const getHealingPort = () => PORT_BASE + HEALING_PORT_OFFSET;

// --- SYSTEM SECRETS ---
const getSecret = (key: string, defaultValue: string): string => {
  const val = process.env[key];
  if (!val) {
    if (process.env.DEBUG_BENCHMARKS) {
      console.warn(`[DEBUG] Missing environment variable ${key}, using default.`);
    }
    return defaultValue;
  }
  return val;
};

export const ADMIN_PASSWORD = getSecret("ADMIN_PASSWORD", "Password123!");
export const TEST_API_SECRET = getSecret("TEST_API_SECRET", "SveltyCMS-Benchmark-Secret-2026");
export const JWT_SECRET_KEY = getSecret(
  "JWT_SECRET_KEY",
  "Benchmark-JWT-Secret-Key-2026-Change-Me",
);
export const JWT_EXPIRES_IN = getSecret("JWT_EXPIRES_IN", "7d");
export const ENCRYPTION_KEY = getSecret(
  "ENCRYPTION_KEY",
  "Benchmark-Encryption-Key-2026-Must-Be-32-Chars!!",
);

// --- PATHS & DIRECTORIES ---
export const ROOT_RESULTS_DIR = path.join(process.cwd(), "tests/benchmarks/results");
export const BENCHMARKS_DOC = path.join(process.cwd(), "docs/project/benchmarks.mdx");
export const CI_SUMMARY_FILE = path.join(ROOT_RESULTS_DIR, "ci-summary.json");
export const DB_NAME_BASE = "SveltyCMS_audit";
/** The single, unified database name used for ALL SQL benchmarks to ensure realism. */
export const DB_NAME_BENCHMARK = "SveltyCMS_benchmark_test";

// --- EXECUTION CONTROL ---
/**
 * Force serial execution for SQL databases (MAX_CONCURRENCY = 1)
 * to ensure single-database integrity and avoid lock contention on SQLite/MariaDB.
 */
export const MAX_CONCURRENCY = 1;

// --- EXPORTS ---
export { BENCHMARK_SCRIPTS } from "./benchmark-scripts";
