/**
 * @file src/databases/public-config-schema.ts
 * @description Defines the validation schema for public application configuration.
 */

import {
  array,
  boolean,
  literal,
  maxValue,
  minLength,
  minValue,
  number,
  object,
  optional,
  pipe,
  string,
  union,
} from "valibot";
import type { InferOutput } from "valibot";

// The PUBLIC configuration for the application.
export const publicConfigSchema = object({
  // --- Host configuration ---
  HOST_DEV: pipe(string(), minLength(1)),
  HOST_PROD: pipe(string(), minLength(1)),

  // --- Site configuration ---
  SITE_NAME: pipe(string(), minLength(1)),
  TIMEZONE: optional(string()),
  PASSWORD_LENGTH: pipe(number(), minValue(8)),

  // --- Language Configuration ---
  DEFAULT_CONTENT_LANGUAGE: pipe(string(), minLength(1)),
  AVAILABLE_CONTENT_LANGUAGES: pipe(array(pipe(string(), minLength(1))), minLength(1)),
  BASE_LOCALE: pipe(string(), minLength(1)),
  LOCALES: pipe(array(pipe(string(), minLength(1))), minLength(1)),

  // --- Media configuration ---
  MEDIA_STORAGE_TYPE: union([
    literal("local"),
    literal("s3"),
    literal("r2"),
    literal("cloudinary"),
  ]),
  MEDIA_FOLDER: pipe(string(), minLength(1)),
  MEDIA_OUTPUT_FORMAT_QUALITY: object({
    format: union([literal("original"), literal("jpg"), literal("webp"), literal("avif")]),
    quality: pipe(number(), minValue(1), maxValue(100)),
  }),
  MEDIASERVER_URL: optional(string()),
  MEDIA_BUCKET_NAME: optional(pipe(string(), minLength(1))),

  // --- Cloud Storage Configuration ---
  MEDIA_CLOUD_REGION: optional(string()),
  MEDIA_CLOUD_ENDPOINT: optional(string()),
  MEDIA_CLOUD_PUBLIC_URL: optional(string()),
  IMAGE_SIZES: object({}),
  MAX_FILE_SIZE: optional(pipe(number(), minValue(1))),
  BODY_SIZE_LIMIT: optional(pipe(number(), minValue(1))),
  EXTRACT_DATA_PATH: optional(string()),
  USE_ARCHIVE_ON_DELETE: optional(boolean()),

  // --- Seasons Icons ---
  SEASONS: optional(boolean()),
  SEASON_REGION: optional(
    union([
      literal("Western_Europe"),
      literal("South_Asia"),
      literal("East_Asia"),
      literal("Global"),
    ]),
  ),

  // --- Versioning ---
  PKG_VERSION: optional(string()),

  // --- Logging ---
  LOG_LEVELS: pipe(
    array(
      union([
        literal("none"),
        literal("error"),
        literal("info"),
        literal("warn"),
        literal("debug"),
        literal("fatal"),
        literal("trace"),
      ]),
    ),
    minLength(1),
  ),
  LOG_RETENTION_DAYS: optional(pipe(number(), minValue(1))),
  LOG_ROTATION_SIZE: optional(pipe(number(), minValue(1))),

  // --- Demo Mode ---
  USE_GOOGLE_OAUTH: optional(boolean()),
  DEMO_TTL: optional(pipe(number(), minValue(1))),

  // --- AI ---
  USE_AI_TAGGING: optional(boolean()),

  // --- Maps ---
  GOOGLE_MAPS_API_KEY: optional(pipe(string(), minLength(1))),
});

export type PublicConfig = InferOutput<typeof publicConfigSchema>;
