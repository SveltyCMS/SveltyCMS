/**
 * @file src/databases/schemas.ts
 * @description Defines validation schemas for application configuration and base database structures.
 */

import { logger } from "@utils/logger";
import { pc } from "@utils/native-utils";
import type { BaseIssue, BaseSchema, InferOutput } from "valibot";
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
  safeParse,
  string,
  transform,
  union,
} from "valibot";
import type { DatabaseId, ISODateString } from "../content/types";

// ----------------- HELPERS -----------------

/** Helper to allow numeric strings (from env) to be used where numbers are expected */
const coercedNumber = union([
  number(),
  pipe(
    string(),
    transform((val) => Number(val)),
    number(),
  ),
]);

// ----------------- CONFIGURATION SCHEMAS -----------------

// The PRIVATE configuration for the application.
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
  LICENSE_KEY: optional(string()), // For Enterprise users to disable nags/tracking
  SVELTYCMS_TELEMETRY: optional(boolean()), // Usage tracking (default: true)
  TELEMETRY_CLIENT_SECRET: optional(string()), // Dynamic HMAC Secret for Telemetry Auth

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
  SMTP_HOST: optional(pipe(string(), minLength(1))),
  SMTP_PORT: optional(pipe(coercedNumber, minValue(1))),
  SMTP_USER: optional(string()),
  SMTP_PASS: optional(string()),
  SMTP_MAIL_FROM: optional(string()),
  SMTP_EMAIL: optional(string()),

  // Roles schema
  ROLES: optional(
    array(
      object({
        _id: pipe(string(), minLength(1)),
        name: pipe(string(), minLength(1)),
        description: optional(string()),
        permissions: array(pipe(string(), minLength(1))),
        isAdmin: optional(boolean()),
        icon: optional(string()),
        color: optional(string()),
      }),
    ),
  ),
  MEDIA_FOLDER: optional(pipe(string(), minLength(1))),

  // --- Cloud Storage Credentials ---
  MEDIA_CLOUD_ACCESS_KEY: optional(pipe(string(), minLength(1))),
  MEDIA_CLOUD_SECRET_KEY: optional(pipe(string(), minLength(1))),
  MEDIA_CLOUDINARY_CLOUD_NAME: optional(pipe(string(), minLength(1))),
  MEDIA_CLOUDINARY_API_KEY: optional(pipe(string(), minLength(1))),
  MEDIA_CLOUDINARY_API_SECRET: optional(pipe(string(), minLength(1))),

  TWITCH_CLIENT_ID: optional(pipe(string(), minLength(1))),
  TWITCH_TOKEN: optional(pipe(string(), minLength(1))),
  TIKTOK_TOKEN: optional(pipe(string(), minLength(1))),

  // --- CORS Configuration ---
  CORS_ENABLED: optional(boolean(), false),
  CORS_ALLOWED_ORIGINS: optional(array(string()), []),
  CORS_ALLOW_CREDENTIALS: optional(boolean(), false),
  CORS_MAX_AGE: optional(pipe(number(), minValue(0)), 86400),
  CORS_ALLOWED_METHODS: optional(array(string()), [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ]),
  CORS_ALLOWED_HEADERS: optional(array(string()), ["Content-Type", "Authorization"]),

  // --- Live Preview ---
  PREVIEW_SECRET: optional(pipe(string(), minLength(32))),

  // --- Firewall Configuration ---
  FIREWALL_ENABLED: optional(boolean()),
  FIREWALL_ALLOWED_BOTS: optional(array(string())),
  FIREWALL_BLOCKED_BOTS: optional(array(string())),

  // --- AI Configuration ---
  USE_AI_TAGGING: optional(boolean()),
  AI_PROVIDER: optional(union([literal("ollama"), literal("openai")])),
  OLLAMA_URL: optional(pipe(string(), minLength(1))),
  AI_API_KEY: optional(pipe(string(), minLength(1))),
  AI_MODEL_VISION: optional(pipe(string(), minLength(1))),
  AI_MODEL_CHAT: optional(pipe(string(), minLength(1))),
  USE_REMOTE_AI_KNOWLEDGE: optional(boolean()),

  // --- SAML SSO Configs ---
  SAML_JIT_PROVISIONING: optional(boolean(), false),
  SAML_CLIENT_SECRET_VERIFIER: optional(pipe(string(), minLength(32))),
  SAML_JWT_SIGNING_PRIVATE_KEY: optional(pipe(string(), minLength(32))),
  SAML_JWT_SIGNING_PUBLIC_KEY: optional(pipe(string(), minLength(32))),

  // --- Auth Configuration ---
  PASSWORD_MIN_LENGTH: optional(pipe(number(), minValue(1)), 8),

  // --- External Host (used for SAML/SSO) ---
  HOST_PROD: optional(string()),

  // --- CI/Benchmark Configuration ---
  TEST_API_SECRET: optional(string()),

  // --- External CDN (Optional) ---
  CF_API_TOKEN: optional(pipe(string(), minLength(1))),
  CF_ZONE_ID: optional(pipe(string(), minLength(1))),
  CF_PURGE_MODE: optional(union([literal("all"), literal("tags")]), "tags"),
});

// The PUBLIC configuration for the application.
// publicConfigSchema is now imported from ./public-config-schema.ts

export const websiteTokenSchema = object({
  _id: pipe(
    string(),
    transform((input) => input as DatabaseId),
  ) as BaseSchema<string, DatabaseId, BaseIssue<string>>,
  name: pipe(string(), minLength(1, "Token name is required.")),
  token: pipe(string(), minLength(32)),
  createdAt: pipe(
    string(),
    transform((input) => input as ISODateString),
  ) as BaseSchema<string, ISODateString, BaseIssue<string>>,
  updatedAt: pipe(
    string(),
    transform((input) => input as ISODateString),
  ) as BaseSchema<string, ISODateString, BaseIssue<string>>,
  createdBy: string(),
  permissions: optional(array(string())),
  expiresAt: optional(
    pipe(
      string(),
      transform((input) => input as ISODateString),
    ) as BaseSchema<string, ISODateString, BaseIssue<string>>,
  ),
});

export const databaseConfigSchema = object({
  type: union([
    literal("mongodb"),
    literal("mongodb+srv"),
    literal("mariadb"),
    literal("postgresql"),
    literal("sqlite"),
  ]),
  host: pipe(string(), minLength(1)),
  port: optional(pipe(number(), minValue(0))),
  name: pipe(string(), minLength(1)),
  user: optional(string()),
  password: optional(string()),
});

// ----------------- TYPES & HELPERS -----------------
export type DatabaseConfig = InferOutput<typeof databaseConfigSchema>;
export type PrivateConfig = InferOutput<typeof privateConfigSchema>;
export type { PublicConfig } from "./public-config-schema";

// --- DYNAMIC COLLECTION SCHEMAS ---
export const collectionSchemas = {
  Names: { name: "Names", label: "Names", fields: [] },
  Relation: { name: "Relation", label: "Relation", fields: [] },
  WidgetTest: { name: "WidgetTest", label: "WidgetTest", fields: [] },
};

export const createPrivateConfig = (arg: PrivateConfig): PrivateConfig => arg;
// We re-export publicConfigSchema here indirectly via the import above
export { publicConfigSchema } from "./public-config-schema";
export const createPublicConfig = (
  arg: import("./public-config-schema").PublicConfig,
): import("./public-config-schema").PublicConfig => arg;

// ----------------- ENHANCED VALIDATION & LOGGING -----------------
let validationLogPrinted = false;

function formatPath(path: BaseIssue<unknown>["path"]): string {
  if (!path || path.length === 0) {
    return "root";
  }
  return path.map((p) => String(p.key)).join(".");
}

function logValidationErrors(issues: BaseIssue<unknown>[], configFile: string): void {
  logger.error(`\n${pc.yellow("⚠️ Invalid configuration in")} ${pc.cyan(configFile)}`);
  issues.forEach((issue) => {
    const fieldPath = formatPath(issue.path) || "Configuration object";
    logger.error(`\n   - ${pc.white("Location:")} ${pc.cyan(fieldPath)}`);
    logger.error(`     ${pc.red(`Error: ${issue.message}`)}`);
    if (issue.input !== undefined) {
      logger.error(`     ${pc.magenta("Received:")} ${pc.red(JSON.stringify(issue.input))}`);
    }
  });
}

interface Config {
  AVAILABLE_CONTENT_LANGUAGES?: string[];
  BASE_LOCALE?: string;
  DEFAULT_CONTENT_LANGUAGE?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  LOCALES?: string[];
  REDIS_HOST?: string;
  REDIS_PORT?: number;
  SEASON_REGION?: string;
  SEASONS?: string[];
  TIKTOK_TOKEN?: string;
  TWO_FACTOR_AUTH_BACKUP_CODES_COUNT?: number;
  USE_2FA?: boolean;
  USE_GOOGLE_OAUTH?: boolean;
  USE_REDIS?: boolean;
  USE_TIKTOK?: boolean;
}

function performConditionalValidation(config: Config): string[] {
  const errors: string[] = [];

  if (config.USE_GOOGLE_OAUTH && !(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET)) {
    errors.push(
      "When USE_GOOGLE_OAUTH is true, both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.",
    );
  }
  if (config.USE_REDIS && !(config.REDIS_HOST && config.REDIS_PORT)) {
    errors.push("When USE_REDIS is true, both REDIS_HOST and REDIS_PORT are required.");
  }
  if (config.USE_TIKTOK && !config.TIKTOK_TOKEN) {
    errors.push("When USE_TIKTOK is true, a TIKTOK_TOKEN is required.");
  }
  if (
    config.USE_2FA &&
    config.TWO_FACTOR_AUTH_BACKUP_CODES_COUNT &&
    (config.TWO_FACTOR_AUTH_BACKUP_CODES_COUNT < 1 ||
      config.TWO_FACTOR_AUTH_BACKUP_CODES_COUNT > 50)
  ) {
    errors.push(
      "When USE_2FA is enabled, TWO_FACTOR_AUTH_BACKUP_CODES_COUNT must be between 1 and 50.",
    );
  }
  if (config.SEASONS && !config.SEASON_REGION) {
    errors.push("When SEASONS is true, a SEASON_REGION must be selected.");
  }
  if (
    config.DEFAULT_CONTENT_LANGUAGE &&
    config.AVAILABLE_CONTENT_LANGUAGES &&
    !config.AVAILABLE_CONTENT_LANGUAGES.includes(config.DEFAULT_CONTENT_LANGUAGE)
  ) {
    errors.push(
      "The DEFAULT_CONTENT_LANGUAGE must be included in the AVAILABLE_CONTENT_LANGUAGES array.",
    );
  }
  if (
    config.BASE_LOCALE &&
    config.LOCALES &&
    Array.isArray(config.LOCALES) &&
    !config.LOCALES.includes(config.BASE_LOCALE)
  ) {
    errors.push("The BASE_LOCALE must be included in the LOCALES array.");
  }

  return errors;
}

export function validateConfig(
  schema: BaseSchema<unknown, unknown, BaseIssue<unknown>>,
  config: unknown,
  configName: string,
): unknown {
  if (!validationLogPrinted) {
    logger.info("Validating CMS configuration...");
    validationLogPrinted = true;
  }

  const result = safeParse(schema, config, { abortEarly: false });
  const configFile = configName.includes("Private") ? "config/private.ts" : "config/public.ts";

  if (result.success) {
    const conditionalErrors = performConditionalValidation(result.output as Config);
    if (conditionalErrors.length > 0) {
      logger.error(`${configName} validation failed with logical errors:`);
      for (const err of conditionalErrors) {
        logger.error(`   - ${err}`);
      }
      process.exit(1);
    }
    return result.output;
  }
  logger.error(`${configName} validation failed. Please check your configuration.`);
  logValidationErrors(result.issues, configFile);
  process.exit(1);
}
