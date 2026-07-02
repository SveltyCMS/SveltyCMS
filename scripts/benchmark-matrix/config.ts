import path from "node:path";
import fs from "node:fs";
import type { DatabaseConfig, DatabaseCapabilities } from "./types";

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

export function getConcurrencyForDb(dbType: string): number {
  return DB_CAPABILITIES[dbType.toLowerCase().replace("-redis", "")]?.concurrency ?? 1;
}

export const MAX_CONCURRENCY = 1;

export const DB_METADATA: Record<string, { label: string; icon: string }> = {
  sqlite: { label: "SQLITE", icon: "" },
  "sqlite-redis": { label: "SQLITE+REDIS", icon: "" },
  mongodb: { label: "MONGODB", icon: "" },
  "mongodb-redis": { label: "MONGODB+REDIS", icon: "" },
  postgresql: { label: "POSTGRESQL", icon: "" },
  "postgresql-redis": { label: "POSTGRESQL+REDIS", icon: "" },
  mariadb: { label: "MARIADB", icon: "" },
  "mariadb-redis": { label: "MARIADB+REDIS", icon: "" },
};

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

function createDbVariants(base: Omit<DatabaseConfig, "useRedis" | "label">): DatabaseConfig[] {
  return [{ ...base }, { ...base, useRedis: true, label: `${base.type.toUpperCase()}+REDIS` }];
}

export const ALL_DATABASES: DatabaseConfig[] = [
  ...createDbVariants({
    type: "sqlite",
    port: 4173,
    host: "config/database",
    user: "",
    password: "",
  }),
  ...createDbVariants({
    type: "mongodb",
    port: Number(process.env.DB_PORT) || 27017,
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "",
    password: process.env.DB_PASSWORD || "",
  }),
  ...createDbVariants({
    type: "postgresql",
    port: Number(process.env.DB_PORT) || 5432,
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
  }),
  ...createDbVariants({
    type: "mariadb",
    port: Number(process.env.DB_PORT) || 3306,
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "mariadb",
  }),
];

export const PORT_BASE = 4173;
export const HEALING_PORT_OFFSET = 99;

let _adminPassword: string | null = null;
let _testApiSecret: string | null = null;
let _jwtSecretKey: string | null = null;
let _jwtExpiresIn: string | null = null;
let _encryptionKey: string | null = null;

function envOr(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export function getAdminPassword(): string {
  if (!_adminPassword) _adminPassword = envOr("ADMIN_PASSWORD", "Password123!");
  return _adminPassword;
}

export function getTestApiSecret(): string {
  if (_testApiSecret) return _testApiSecret;
  if (process.env.TEST_API_SECRET) {
    _testApiSecret = process.env.TEST_API_SECRET;
    return _testApiSecret;
  }
  try {
    const p = path.join(process.cwd(), "tests", "e2e", ".auth", "test-secret.txt");
    if (fs.existsSync(p)) {
      _testApiSecret = fs.readFileSync(p, "utf8").trim();
      return _testApiSecret;
    }
  } catch {
    /* ignore */
  }
  _testApiSecret = "SVELTYCMS_TEST_SECRET_2026";
  return _testApiSecret;
}

export function getJwtSecretKey(): string {
  if (!_jwtSecretKey)
    _jwtSecretKey = envOr("JWT_SECRET_KEY", "Benchmark-JWT-Secret-Key-2026-Change-Me");
  return _jwtSecretKey;
}

export function getJwtExpiresIn(): string {
  if (!_jwtExpiresIn) _jwtExpiresIn = envOr("JWT_EXPIRES_IN", "7d");
  return _jwtExpiresIn;
}

export function getEncryptionKey(): string {
  if (!_encryptionKey)
    _encryptionKey = envOr("ENCRYPTION_KEY", "Benchmark-Encryption-Key-2026-Must-Be-32-Chars!!");
  return _encryptionKey;
}

export const ADMIN_PASSWORD = getAdminPassword();
export const TEST_API_SECRET = getTestApiSecret();
export const JWT_SECRET_KEY = getJwtSecretKey();
export const JWT_EXPIRES_IN = getJwtExpiresIn();
export const ENCRYPTION_KEY = getEncryptionKey();

export const ROOT_RESULTS_DIR = path.join(process.cwd(), "tests", "benchmarks", "results");

export {
  USER_COLLECTIONS_DIR,
  BENCHMARK_COLLECTIONS_DIR,
  USER_COMPILED_DIR,
  BENCHMARK_COMPILED_DIR,
  getBenchmarkWorkspace,
  prepareBenchmarkCompiledWorkspace,
  cleanupBenchmarkCompiledWorkspace,
  cleanupAllBenchmarkWorkspaces,
} from "../../src/utils/benchmark-paths";

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

// Benchmark scripts list is inline in benchmark-matrix/index.ts

export const ADAPTER_BUDGET_OVERRIDES: Record<string, Partial<Record<string, number>>> = {
  sqlite: { indexPressure: 250, dbRaw: 80 },
  postgresql: { indexPressure: 100, dbRaw: 30 },
  mariadb: { indexPressure: 150, dbRaw: 40 },
  mongodb: { indexPressure: 150, dbRaw: 40 },
};

export const CORRELATION_RULES = [
  {
    name: "middleware",
    primaryMetric: "hooks",
    correlatedMetrics: ["collections", "authAvg"],
    antiCorrelatedMetrics: ["dbRaw"],
  },
  {
    name: "adapter",
    primaryMetric: "dbRaw",
    correlatedMetrics: ["collections", "graphqlAvg", "indexPressure"],
    antiCorrelatedMetrics: ["hooks"],
  },
  {
    name: "native",
    primaryMetric: "memGrowth",
    correlatedMetrics: ["mediaAvg"],
    antiCorrelatedMetrics: ["hooks", "dbRaw"],
  },
] as const;
