/**
 * @file scripts\benchmark-matrix\config.ts
 * @description Configuration file for the benchmark matrix tool.
 */

import path from "node:path";
import fs from "node:fs";
import type { DatabaseConfig } from "./types";

// --- PERFORMANCE BUDGETS ---
export const PERFORMANCE_BUDGET = {
  coldStartMs: 5_000,
  collections: 5,
  graphqlAvg: 5,
  dbRaw: 50,
  hooks: 2.0,
  memGrowth: 60,
  securityMs: 25,
  openapiHit: 10,
  indexPressure: 250,
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
export const TEST_API_SECRET = (() => {
  if (process.env.TEST_API_SECRET) return process.env.TEST_API_SECRET;
  try {
    const secretPath = path.join(process.cwd(), "tests", "e2e", ".auth", "test-secret.txt");
    if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, "utf8").trim();
  } catch {
    // Ignore
  }
  return "SVELTYCMS_TEST_SECRET_2026";
})();
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
export const BENCHMARKS_DOC = path.join(process.cwd(), "docs/project/benchmarks/index.mdx");
export const CI_SUMMARY_FILE = path.join(ROOT_RESULTS_DIR, "ci-summary.json");
export const DB_NAME_BASE = "SveltyCMS_audit";
/** The single, unified database name used for ALL SQL benchmarks to ensure realism. */
export const DB_NAME_BENCHMARK = process.env.DB_NAME_BENCHMARK || "sveltycms_bench";

// --- EXECUTION CONTROL ---
/**
 * 🚀 DYNAMIC CONCURRENCY THROTTLE
 * SQL databases like PostgreSQL and MariaDB are designed for high-concurrency,
 * while SQLite requires serialization (1) to prevent file lock contention.
 */
export const getConcurrencyForDb = (dbType: string): number => {
  const type = dbType.toLowerCase();
  if (type.includes("postgres") || type.includes("mariadb") || type.includes("mongodb")) {
    return 4; // High-concurrency for enterprise engines
  }
  return 1; // Serial execution for SQLite / Edge
};

/** @deprecated Use getConcurrencyForDb(type) for engine-aware throttling */
export const MAX_CONCURRENCY = 1;

// --- EXPORTS ---
export { BENCHMARK_SCRIPTS } from "./benchmark-scripts";
