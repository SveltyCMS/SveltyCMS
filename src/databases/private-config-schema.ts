/**
 * @file src/databases/private-config-schema.ts
 * @description Defines the validation schema for private application configuration.
 */

import {
  array,
  boolean,
  literal,
  minLength,
  minValue,
  number,
  object,
  optional,
  pipe,
  string,
  toBoolean,
  toNumber,
  union,
} from "valibot";
import type { InferOutput } from "valibot";

// Helper to allow strings (from env) to be used where numbers or booleans are expected
const coercedNumber = union([number(), pipe(string(), toNumber(), number())]);
const coercedBoolean = union([boolean(), pipe(string(), toBoolean(), boolean())]);

/**
 * The PRIVATE configuration for the application.
 * Contains sensitive database credentials and internal system keys.
 */
export const privateConfigSchema = object({
  // --- Database configuration (Essential for startup) ---
  DB_TYPE: union([
    literal("mongodb"),
    literal("mongodb+srv"),
    literal("mariadb"),
    literal("postgresql"),
    literal("sqlite"),
    literal(""),
  ]),
  DB_HOST: pipe(string(), minLength(1, "Database host is required.")),
  DB_PORT: optional(pipe(coercedNumber, minValue(0))),
  DB_NAME: pipe(string(), minLength(1, "Database name is required.")),
  DB_USER: optional(string()),
  DB_PASSWORD: optional(string()),
  DB_RETRY_ATTEMPTS: optional(pipe(coercedNumber, minValue(1))),
  DB_RETRY_DELAY: optional(pipe(coercedNumber, minValue(1))),
  DB_POOL_SIZE: optional(pipe(coercedNumber, minValue(1))),

  // --- Enterprise Scaling Layers (optional, zero-config default = driver-internal pools) ---
  // External DB connection pooler (PgBouncer for Postgres, ProxySQL/MaxScale for MariaDB/MySQL, mongos awareness for Mongo).
  // When enabled, adapters adjust connection strings, prepare statements (PG: prepare:false in transaction mode), and pool sizing.
  // See docs/guides/deployment/scaling-layers.mdx for full guidance + examples. Fully optional; single-node works without.
  DB_POOLER_TYPE: optional(
    union([
      literal("pgbouncer"),
      literal("proxysql"),
      literal("mongos"),
      literal("none"),
      literal(""),
    ]),
  ),
  DB_POOLER_URL: optional(string()), // Full connection string to the pooler (e.g. postgres://... on port 6432). Falls back to primary DB if unset.
  DB_POOLER_MODE: optional(
    union([literal("transaction"), literal("session"), literal("statement")]),
  ),
  DB_POOLER_PREPARE: optional(coercedBoolean), // Override for PG (false recommended behind PgBouncer tx mode to avoid prepared stmt issues)

  // Trusted reverse proxies (Nginx, Caddy, Traefik, load balancers). For correct client IP, rate limiting, security headers (X-Forwarded-*).
  // Comma or array in env; used by hooks/index for proxy header trust. Optional for direct deploys.
  TRUSTED_PROXIES: optional(union([string(), array(string())])),

  // --- JWT Secret (Essential for startup) ---
  JWT_SECRET_KEY: pipe(
    string(),
    minLength(32, "JWT Secret Key must be at least 32 characters long for security."),
  ),

  // --- Encryption Key (Essential for startup) ---
  ENCRYPTION_KEY: pipe(
    string(),
    minLength(32, "Encryption Key must be at least 32 characters long for security."),
  ),

  // --- Multi-tenancy (Essential for startup) ---
  MULTI_TENANT: optional(coercedBoolean),
  DEMO: optional(coercedBoolean),

  // --- Licensing & Telemetry (BSL 1.1 Support) ---
  LICENSE_KEY: optional(string()),
  SVELTYCMS_TELEMETRY: optional(coercedBoolean),
  TELEMETRY_CLIENT_SECRET: optional(string()),

  // --- Optional service toggles (populated dynamically post-startup) ---
  USE_REDIS: optional(coercedBoolean),
  REDIS_HOST: optional(pipe(string(), minLength(1))),
  REDIS_PORT: optional(pipe(coercedNumber, minValue(1))),
  REDIS_PASSWORD: optional(string()),

  // --- Cache TTL Configuration (in seconds) ---
  CACHE_TTL_SCHEMA: optional(pipe(coercedNumber, minValue(1))),
  CACHE_TTL_WIDGET: optional(pipe(coercedNumber, minValue(1))),
  CACHE_TTL_THEME: optional(pipe(coercedNumber, minValue(1))),
  CACHE_TTL_CONTENT: optional(pipe(coercedNumber, minValue(1))),
  CACHE_TTL_MEDIA: optional(pipe(coercedNumber, minValue(1))),
  CACHE_TTL_SESSION: optional(pipe(coercedNumber, minValue(1))),
  CACHE_TTL_USER: optional(pipe(coercedNumber, minValue(1))),
  CACHE_TTL_API: optional(pipe(coercedNumber, minValue(1))),

  GOOGLE_CLIENT_ID: optional(pipe(string(), minLength(1))),
  GOOGLE_CLIENT_SECRET: optional(pipe(string(), minLength(1))),
  GOOGLE_API_KEY: optional(pipe(string(), minLength(1))),
  GOOGLE_PAGESPEED_API_KEY: optional(pipe(string(), minLength(1))),

  GITHUB_CLIENT_ID: optional(pipe(string(), minLength(1))),
  GITHUB_CLIENT_SECRET: optional(pipe(string(), minLength(1))),

  TEST_API_SECRET: optional(string()),

  // --- External CDN (Optional) ---
  CF_API_TOKEN: optional(pipe(string(), minLength(1))),
  CF_ZONE_ID: optional(pipe(string(), minLength(1))),
  CF_PURGE_MODE: optional(union([literal("all"), literal("tags")]), "tags"),

  // --- AI Configuration ---
  USE_REMOTE_AI_KNOWLEDGE: optional(coercedBoolean),
  OLLAMA_URL: optional(string()),
  AI_MODEL_CHAT: optional(string()),
  USE_AI_TAGGING: optional(coercedBoolean),
  AI_MODEL_VISION: optional(string()),

  // --- Authentication & Security ---
  PASSWORD_MIN_LENGTH: optional(coercedNumber),
  PREVIEW_SECRET: optional(string()),
  RATE_LIMIT_SECRET: optional(string()),

  // --- CORS Configuration ---
  CORS_ENABLED: optional(coercedBoolean),
  CORS_ALLOWED_ORIGINS: optional(array(string())),
  CORS_ALLOWED_METHODS: optional(array(string())),
  CORS_ALLOWED_HEADERS: optional(array(string())),
  CORS_MAX_AGE: optional(coercedNumber),
  CORS_ALLOW_CREDENTIALS: optional(coercedBoolean),

  // --- Social Media & OAuth ---
  TWITCH_CLIENT_ID: optional(string()),
  TWITCH_TOKEN: optional(string()),
  TIKTOK_TOKEN: optional(string()),
  SAML_JIT_PROVISIONING: optional(coercedBoolean),
  SAML_CLIENT_SECRET_VERIFIER: optional(string()),
  SAML_ENCRYPTION_KEY: optional(string()),
  SAML_JWT_SIGNING_PRIVATE_KEY: optional(string()),
  SAML_JWT_SIGNING_PUBLIC_KEY: optional(string()),

  // --- Common Public/Private Overlaps (Required for some services) ---
  HOST_PROD: optional(string()),
  // --- Edge Sync (Upstash/Redis) ---
  EDGE_KV_URL: optional(string()),
  EDGE_KV_TOKEN: optional(string()),

  // --- Media & Uploads ---
  CONCURRENT_UPLOAD_SIZE: optional(pipe(coercedNumber, minValue(1))),

  // --- Signed Media URLs ---
  MEDIA_SIGNED_URL_SECRET: optional(pipe(string(), minLength(1))),
});

export type PrivateConfig = InferOutput<typeof privateConfigSchema>;
