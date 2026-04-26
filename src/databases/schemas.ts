/**
 * @file src/databases/schemas.ts
 * @description Defines validation schemas for application configuration and base database structures.
 */

import {
  array,
  boolean,
  literal,
  minLength,
  number,
  object,
  optional,
  pipe,
  string,
  transform,
  union,
  safeParse,
} from "valibot";
import type { BaseIssue, BaseSchema, InferOutput } from "valibot";
import type { DatabaseId, ISODateString } from "../content/types";

// ----------------- HELPERS -----------------

/** Helper to allow numeric strings (from env) to be used where numbers are expected */
const coercedNumber = optional(
  union([
    number(),
    pipe(
      string(),
      transform((val) => Number(val)),
      number(),
    ),
  ]),
);

// ----------------- CONFIGURATION SCHEMAS -----------------

// Re-export privateConfigSchema from its own file
export { privateConfigSchema } from "./private-config-schema";
export type { PrivateConfig } from "./private-config-schema";

// Re-export publicConfigSchema from its own file
export { publicConfigSchema } from "./public-config-schema";
export type { PublicConfig } from "./public-config-schema";

// ----------------- OTHER SCHEMAS -----------------

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
});

export type WebsiteToken = InferOutput<typeof websiteTokenSchema>;

export const userTokenSchema = object({
  _id: pipe(
    string(),
    transform((input) => input as DatabaseId),
  ) as BaseSchema<string, DatabaseId, BaseIssue<string>>,
  name: pipe(string(), minLength(1, "Token name is required.")),
  userId: pipe(
    string(),
    transform((input) => input as DatabaseId),
  ) as BaseSchema<string, DatabaseId, BaseIssue<string>>,
  token: pipe(string(), minLength(32)),
  createdAt: pipe(
    string(),
    transform((input) => input as ISODateString),
  ) as BaseSchema<string, ISODateString, BaseIssue<string>>,
  expiresAt: optional(
    pipe(
      string(),
      transform((input) => input as ISODateString),
    ) as BaseSchema<string, ISODateString, BaseIssue<string>>,
  ),
});

export type UserToken = InferOutput<typeof userTokenSchema>;

export const roleSchema = object({
  _id: pipe(
    string(),
    transform((input) => input as DatabaseId),
  ) as BaseSchema<string, DatabaseId, BaseIssue<string>>,
  name: pipe(string(), minLength(1, "Role name is required.")),
  description: optional(string()),
  permissions: array(string()),
  isAdmin: optional(boolean(), false),
  createdAt: optional(
    pipe(
      string(),
      transform((input) => input as ISODateString),
    ) as BaseSchema<string, ISODateString, BaseIssue<string>>,
  ),
  updatedAt: optional(
    pipe(
      string(),
      transform((input) => input as ISODateString),
    ) as BaseSchema<string, ISODateString, BaseIssue<string>>,
  ),
});

export type Role = InferOutput<typeof roleSchema>;

/**
 * Validates any config object against a given schema.
 */
export function validateConfig(
  schema: BaseSchema<unknown, unknown, BaseIssue<unknown>>,
  config: unknown,
  configName: string,
): unknown {
  const result = safeParse(schema, config, { abortEarly: false });
  if (result.success) return result.output;

  console.error(`❌ ${configName} validation failed:`, JSON.stringify(result.issues, null, 2));
  process.exit(1);
}

// ----------------- SETUP & TEST CONFIG -----------------

/**
 * Configuration for a single database instance used in setup and tests.
 */
export interface DatabaseConfig {
  type: "mongodb" | "mongodb+srv" | "mariadb" | "postgresql" | "sqlite";
  host: string;
  port?: number;
  name: string;
  user?: string;
  password?: string;
}

/**
 * Validation schema for DatabaseConfig.
 */
export const databaseConfigSchema = object({
  type: union([
    literal("mongodb"),
    literal("mongodb+srv"),
    literal("mariadb"),
    literal("postgresql"),
    literal("sqlite"),
  ]),
  host: pipe(string(), minLength(1)),
  port: coercedNumber,
  name: pipe(string(), minLength(1)),
  user: optional(string()),
  password: optional(string()),
});
