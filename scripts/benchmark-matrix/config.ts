/**
 * @file scripts/benchmark-matrix/config.ts
 * @description Centralized benchmark configuration with lazy-loading secrets,
 * capability-based DB architecture, and factory-pattern database generation.
 *
 * ### Enterprise Features:
 * - lazy secret loading (defers FS I/O, reduces cold-start overhead)
 * - factory-generated database configs (no duplication)
 * - capability-based concurrency (not brittle string matching)
 * - consistent path.join usage across platforms
 * - split import surface (avoids pulling benchmark-scripts at config load)
 */

import path from "node:path";
import fs from "node:fs";
import type { DatabaseConfig, DatabaseCapabilities } from "./types";

// ─────────────────────────────────────────────────────────────
// Performance Budgets
// ─────────────────────────────────────────────────────────────

export const PERFORMANCE_BUDGET = {
  coldStartMs: 5_000,
  collections: 5,
  graphqlAvg: 12,
  dbRaw: 50,
  hooks: 2.0,
  memGrowth: 60,
  securityMs: 25,
  openapiHit: 10,
  indexPressure: 250,
  buildDuration: 80000,
  bundleSizeTotal: 25,
} as const;

// ─────────────────────────────────────────────────────────────
// Database Capabilities (engine-aware, not string matching)
// ─────────────────────────────────────────────────────────────

export const DB_CAPABILITIES: Record<string, DatabaseCapabilities> = {
  sqlite: {
    concurrency: 1,
    capabilities: ["embedded", "transactions"],
    transactional: true,
    networked: false,
  },
  postgresql: {
    concurrency: 4,
    capabilities: [
      "transactions",
      "joins",
      "secondaryIndexes",
      "aggregations",
      "fullTextSearch",
      "networked",
    ],
    transactional: true,
    networked: true,
  },
  mariadb: {
    concurrency: 4,
    capabilities: [
      "transactions",
      "joins",
      "secondaryIndexes",
      "aggregations",
      "fullTextSearch",
      "networked",
    ],
    transactional: true,
    networked: true,
  },
  mongodb: {
    concurrency: 4,
    capabilities: ["transactions", "secondaryIndexes", "aggregations", "networked"],
    transactional: true,
    networked: true,
  },
} as const;

/** Get concurrency for a DB type using capability metadata */
export function getConcurrencyForDb(dbType: string): number {
  const type = dbType.toLowerCase().replace("-redis", "");
  return DB_CAPABILITIES[type]?.concurrency ?? 1;
}

/** @deprecated Use getConcurrencyForDb(type) for engine-aware throttling */
export const MAX_CONCURRENCY = 1;

// ─────────────────────────────────────────────────────────────
// Database Metadata
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Database Configs (Factory Pattern — no duplication)
// ─────────────────────────────────────────────────────────────

/** Factory: generates plain + Redis variant for a DB config */
function createDbVariants(base: Omit<DatabaseConfig, "useRedis" | "label">): DatabaseConfig[] {
  const plain: DatabaseConfig = { ...base };
  const redis: DatabaseConfig = {
    ...base,
    useRedis: true,
    label: `${base.type.toUpperCase()}+REDIS`,
  };
  return [plain, redis];
}

export const ALL_DATABASES: DatabaseConfig[] = [
  ...createDbVariants({
    type: "sqlite",
    port: 4173,
    host: path.join(".", "config", "database"),
    user: "",
    password: "",
  }),
  ...createDbVariants({
    type: "mongodb",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 27017,
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER !== undefined ? process.env.DB_USER : "",
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : "",
  }),
  ...createDbVariants({
    type: "postgresql",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER !== undefined ? process.env.DB_USER : "postgres",
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : "postgres",
  }),
  ...createDbVariants({
    type: "mariadb",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER !== undefined ? process.env.DB_USER : "root",
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : "mariadb",
  }),
];

// ─────────────────────────────────────────────────────────────
// Network & Ports
// ─────────────────────────────────────────────────────────────

export const PORT_BASE = 4173;
export const SETUP_PORT_OFFSET = 99;
export const HEALING_PORT_OFFSET = 99;

export const getWorkerPort = (index: number) => PORT_BASE + index;
export const getSetupPort = () => PORT_BASE + SETUP_PORT_OFFSET;
export const getHealingPort = () => PORT_BASE + HEALING_PORT_OFFSET;

// ─────────────────────────────────────────────────────────────
// Secrets (Lazy-Loaded — defers FS I/O until first access)
// ─────────────────────────────────────────────────────────────

let _adminPassword: string | null = null;
let _testApiSecret: string | null = null;
let _jwtSecretKey: string | null = null;
let _jwtExpiresIn: string | null = null;
let _encryptionKey: string | null = null;

function envOr(key: string, fallback: string): string {
  const val = process.env[key];
  if (!val && process.env.DEBUG_BENCHMARKS) {
    console.warn(`[DEBUG] Missing ${key}, using default.`);
  }
  return val || fallback;
}

export function getAdminPassword(): string {
  if (!_adminPassword) {
    _adminPassword = envOr("ADMIN_PASSWORD", "Password123!");
  }
  return _adminPassword;
}

export function getTestApiSecret(): string {
  if (_testApiSecret) return _testApiSecret;
  if (process.env.TEST_API_SECRET) {
    _testApiSecret = process.env.TEST_API_SECRET;
    return _testApiSecret;
  }
  try {
    const secretPath = path.join(process.cwd(), "tests", "e2e", ".auth", "test-secret.txt");
    if (fs.existsSync(secretPath)) {
      _testApiSecret = fs.readFileSync(secretPath, "utf8").trim();
      return _testApiSecret;
    }
  } catch {
    // Ignore
  }
  _testApiSecret = "SVELTYCMS_TEST_SECRET_2026";
  return _testApiSecret;
}

export function getJwtSecretKey(): string {
  if (!_jwtSecretKey) {
    _jwtSecretKey = envOr("JWT_SECRET_KEY", "Benchmark-JWT-Secret-Key-2026-Change-Me");
  }
  return _jwtSecretKey;
}

export function getJwtExpiresIn(): string {
  if (!_jwtExpiresIn) {
    _jwtExpiresIn = envOr("JWT_EXPIRES_IN", "7d");
  }
  return _jwtExpiresIn;
}

export function getEncryptionKey(): string {
  if (!_encryptionKey) {
    _encryptionKey = envOr("ENCRYPTION_KEY", "Benchmark-Encryption-Key-2026-Must-Be-32-Chars!!");
  }
  return _encryptionKey;
}

// Backward-compatible constants (lazy on first access)
export const ADMIN_PASSWORD = getAdminPassword();
export const TEST_API_SECRET = getTestApiSecret();
export const JWT_SECRET_KEY = getJwtSecretKey();
export const JWT_EXPIRES_IN = getJwtExpiresIn();
export const ENCRYPTION_KEY = getEncryptionKey();

// ─────────────────────────────────────────────────────────────
// Paths & Directories
// ─────────────────────────────────────────────────────────────

export const ROOT_RESULTS_DIR = path.join(process.cwd(), "tests", "benchmarks", "results");
export const BENCHMARKS_DOC = path.join(
  process.cwd(),
  "docs",
  "project",
  "benchmarks",
  "index.mdx",
);
export const CI_SUMMARY_FILE = path.join(ROOT_RESULTS_DIR, "ci-summary.json");
export const DB_NAME_BASE = "SveltyCMS_audit";
export const DB_NAME_BENCHMARK = process.env.DB_NAME_BENCHMARK || "sveltycms_bench";

// ─────────────────────────────────────────────────────────────
// Benchmark Scripts (lazy import to reduce config fan-out)
// ─────────────────────────────────────────────────────────────

// Re-exported for backward compatibility but imported lazily elsewhere
export { BENCHMARK_SCRIPTS } from "./benchmark-scripts";
// ─────────────────────────────────────────────────────────────
// Per-Adapter Budget Overrides (learned or set per engine)
// ─────────────────────────────────────────────────────────────

export const ADAPTER_BUDGET_OVERRIDES: Record<string, Partial<Record<string, number>>> = {
  sqlite: { indexPressure: 250, dbRaw: 80 }, // single-writer bottleneck
  postgresql: { indexPressure: 100, dbRaw: 30 }, // concurrent engine
  mariadb: { indexPressure: 150, dbRaw: 40 },
  mongodb: { indexPressure: 150, dbRaw: 40 },
};

// ─────────────────────────────────────────────────────────────
// Correlation Rules for Root Cause Classification
// ─────────────────────────────────────────────────────────────

export const CORRELATION_RULES = [
  {
    name: "middleware",
    primaryMetric: "hooks",
    correlatedMetrics: ["collections", "authAvg"],
    antiCorrelatedMetrics: ["dbRaw"], // hooks issue shouldn't affect raw DB
  },
  {
    name: "adapter",
    primaryMetric: "dbRaw",
    correlatedMetrics: ["collections", "graphqlAvg", "indexPressure"],
    antiCorrelatedMetrics: ["hooks"], // DB raw issue shouldn't affect hooks
  },
  {
    name: "scale",
    primaryMetric: "indexPressure",
    correlatedMetrics: ["mixedAvg", "tenancyAvg"],
    antiCorrelatedMetrics: ["dbRaw", "coldStartMs"], // not a startup or DB raw problem
  },
  {
    name: "native",
    primaryMetric: "memGrowth",
    correlatedMetrics: ["mediaAvg"], // sharp/native bindings involvement
    antiCorrelatedMetrics: ["hooks", "dbRaw"], // JS heap stable → not a JS leak
  },
  {
    name: "environment_cpu",
    primaryMetric: "coldStartMs",
    correlatedMetrics: ["collections", "hooks", "dbRaw", "graphqlAvg"],
    antiCorrelatedMetrics: ["memGrowth"], // memory stable → CPU environment shift
  },
  {
    name: "environment_memory",
    primaryMetric: "memGrowth",
    correlatedMetrics: ["coldStartMs"],
    antiCorrelatedMetrics: ["collections", "dbRaw"], // latency stable → memory pressure
  },
] as const;
