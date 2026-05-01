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
  transform,
  union,
} from "valibot";
import type { InferOutput } from "valibot";

// Helper to allow numeric strings (from env) to be used where numbers are expected
const coercedNumber = union([
  number(),
  pipe(
    string(),
    transform((val) => Number(val)),
    number(),
  ),
]);

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
  DB_RETRY_ATTEMPTS: optional(pipe(number(), minValue(1))),
  DB_RETRY_DELAY: optional(pipe(number(), minValue(1))),
  DB_POOL_SIZE: optional(pipe(number(), minValue(1))),

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
  MULTI_TENANT: optional(boolean()),
  DEMO: optional(boolean()),

  // --- Licensing & Telemetry (BSL 1.1 Support) ---
  LICENSE_KEY: optional(string()),
  SVELTYCMS_TELEMETRY: optional(boolean()),
  TELEMETRY_CLIENT_SECRET: optional(string()),

  // --- Optional service toggles (populated dynamically post-startup) ---
  USE_REDIS: optional(boolean()),
  REDIS_HOST: optional(pipe(string(), minLength(1))),
  REDIS_PORT: optional(pipe(coercedNumber, minValue(1))),
  REDIS_PASSWORD: optional(string()),

  // --- Cache TTL Configuration (in seconds) ---
  CACHE_TTL_SCHEMA: optional(pipe(number(), minValue(1))),
  CACHE_TTL_WIDGET: optional(pipe(number(), minValue(1))),
  CACHE_TTL_THEME: optional(pipe(number(), minValue(1))),
  CACHE_TTL_CONTENT: optional(pipe(number(), minValue(1))),
  CACHE_TTL_MEDIA: optional(pipe(number(), minValue(1))),
  CACHE_TTL_SESSION: optional(pipe(number(), minValue(1))),
  CACHE_TTL_USER: optional(pipe(number(), minValue(1))),
  CACHE_TTL_API: optional(pipe(number(), minValue(1))),

  GOOGLE_CLIENT_ID: optional(pipe(string(), minLength(1))),
  GOOGLE_CLIENT_SECRET: optional(pipe(string(), minLength(1))),
  GOOGLE_API_KEY: optional(pipe(string(), minLength(1))),
  GOOGLE_PAGESPEED_API_KEY: optional(pipe(string(), minLength(1))),

  TEST_API_SECRET: optional(string()),

  // --- External CDN (Optional) ---
  CF_API_TOKEN: optional(pipe(string(), minLength(1))),
  CF_ZONE_ID: optional(pipe(string(), minLength(1))),
  CF_PURGE_MODE: optional(union([literal("all"), literal("tags")]), "tags"),

  // --- AI Configuration ---
  USE_REMOTE_AI_KNOWLEDGE: optional(boolean()),
  OLLAMA_URL: optional(string()),
  AI_MODEL_CHAT: optional(string()),
  USE_AI_TAGGING: optional(boolean()),
  AI_MODEL_VISION: optional(string()),

  // --- Authentication & Security ---
  PASSWORD_MIN_LENGTH: optional(coercedNumber),
  PREVIEW_SECRET: optional(string()),

  // --- CORS Configuration ---
  CORS_ENABLED: optional(boolean()),
  CORS_ALLOWED_ORIGINS: optional(array(string())),
  CORS_ALLOWED_METHODS: optional(array(string())),
  CORS_ALLOWED_HEADERS: optional(array(string())),
  CORS_MAX_AGE: optional(coercedNumber),
  CORS_ALLOW_CREDENTIALS: optional(boolean()),

  // --- Social Media & OAuth ---
  TWITCH_CLIENT_ID: optional(string()),
  TWITCH_TOKEN: optional(string()),
  TIKTOK_TOKEN: optional(string()),
  SAML_JIT_PROVISIONING: optional(boolean()),

  // --- Common Public/Private Overlaps (Required for some services) ---
  HOST_PROD: optional(string()),
  // --- Edge Sync (Upstash/Redis) ---
  EDGE_KV_URL: optional(string()),
  EDGE_KV_TOKEN: optional(string()),
});

export type PrivateConfig = InferOutput<typeof privateConfigSchema>;
