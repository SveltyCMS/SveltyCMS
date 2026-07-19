/**
 * @file: src/utils/formSchemas.ts
 * @description: Hardened Valibot schemas for high-security CMS input.
 *
 * ### Hardening (audit 2026-07):
 * - ReDoS protection: anchored regex patterns (^...$) on all string validators
 * - strictObject adoption: login, reset, setup, and db config block extra field injection
 * - Password: regex pipe replaces custom() validator (native C++ regex vs JS closure)
 * - SMTP host: separated custom() (email check) + regex() (hostname) for clarity
 * - DB config: simplified check() with requiresAuth array pattern
 *
 * @requires valibot - For schema definition and validation
 * @requires @src/stores/global-settings - For accessing settings from database
 */

import {
  array,
  boolean,
  check,
  custom,
  email as emailValidator,
  forward,
  type InferInput,
  maxLength,
  minLength,
  nullable,
  number,
  object,
  optional,
  partialCheck,
  picklist,
  pipe,
  regex,
  strictObject,
  string,
  transform,
  trim,
} from "valibot";

import { publicEnv } from "@src/stores/global-settings.svelte";

// NOTE: Error messages are plain strings for universal (client/server) compatibility.
const getMinPasswordLength = () => publicEnv?.PASSWORD_MIN_LENGTH ?? 8;

// --- Reusable Username Schemas ---
const usernameSchema = pipe(
  string(),
  trim(),
  minLength(2, "Please enter a username with at least 2 characters."),
  maxLength(50, "Username is too long (max 50 characters)."),
  // Anchored regex to prevent ReDoS
  regex(/^[a-zA-Z0-9@$!%*#._-]+$/, "Invalid username characters."),
);

// --- Reusable Email Schemas ---
const emailSchema = pipe(
  string(),
  trim(),
  transform((value) => value.toLowerCase()),
  emailValidator("Please enter a valid email address."),
);

// --- Reusable Password Schemas ---
// Structured as a pipe rather than a custom function for performance
const passwordSchema = pipe(
  string(),
  trim(),
  minLength(
    getMinPasswordLength(),
    `Password must be at least ${getMinPasswordLength()} characters.`,
  ),
  // Escape `]` so the character class is not closed early (would reject all valid passwords).
  regex(
    /^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?]).+$/,
    "Password must include a letter, number, and special character.",
  ),
);

// --- Reusable Confirm Password Schemas ---
const confirmPasswordSchema = pipe(string(), trim());

// --- Reusable Token Schemas ---
const tokenSchema = pipe(
  string(),
  trim(),
  minLength(32, "Token must be at least 32 characters."),
  maxLength(64, "Token must be max 64 characters."),
);

// --- Form Schemas ---

// Login Form Schema — strictObject blocks extra field injection
export const loginFormSchema = strictObject({
  email: emailSchema,
  password: pipe(string(), trim()), // No complexity check at login
  isToken: boolean(),
});

// Forgot Password Form Schema
export const forgotFormSchema = object({
  email: emailSchema,
});

// Reset Password Form Schema — strictObject prevents payload injection
export const resetFormSchema = pipe(
  strictObject({
    password: passwordSchema,
    confirmPassword: confirmPasswordSchema,
    token: tokenSchema,
    email: emailSchema,
  }),
  forward(
    partialCheck(
      [["password"], ["confirmPassword"]],
      (input) => input.password === input.confirmPassword,
      "The passwords do not match.",
    ),
    ["confirmPassword"],
  ),
);

// Sign Up User Form Schema
export const signUpFormSchema = pipe(
  object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirm_password: confirmPasswordSchema,
    token: optional(tokenSchema),
  }),
  check((input) => input.password === input.confirm_password, "The passwords do not match."),
);

// Google OAuth Token Schema
export const signUpOAuthFormSchema = object({
  lang: nullable(string()),
});

// Validate New User Token Schema
export const addUserTokenSchema = object({
  email: emailSchema,
  role: string(),
  expiresIn: string(),
});

// Change Password Form Schema
export const changePasswordSchema = object({
  oldPassword: string(),
  password: passwordSchema,
  confirmPassword: string(),
});

// Widget Email Schema
export const widgetEmailSchema = object({
  email: emailSchema,
});

// Add User Schema
export const addUserSchema = object({
  email: emailSchema,
  role: string(),
});

// Edit User Schema
export const editUserSchema = pipe(
  object({
    user_id: string(),
    username: usernameSchema,
    email: emailSchema,
    role: optional(string()),
    password: optional(string()),
    confirmPassword: optional(string()),
    currentPassword: optional(string()),
  }),
  forward(
    check((input) => {
      const hasPassword = input.password && input.password.length > 0;
      const hasConfirmPassword = input.confirmPassword && input.confirmPassword.length > 0;

      if (hasPassword && hasConfirmPassword) {
        return input.password === input.confirmPassword;
      }
      return true;
    }, "The passwords do not match."),
    ["confirmPassword"],
  ),
);

// Setup Admin User Schema
export const setupAdminSchema = pipe(
  strictObject({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: confirmPasswordSchema,
  }),
  check((input) => input.password === input.confirmPassword, "The passwords do not match."),
);

// --- SMTP Configuration Schemas ---

// SMTP Host Schema — separated custom check + regex for clarity
const smtpHostSchema = pipe(
  string(),
  trim(),
  minLength(1, "SMTP host is required"),
  maxLength(255, "SMTP host is too long"),
  custom(
    (v) => typeof v === "string" && !v.includes("@"),
    "Do not use email addresses for SMTP hosts.",
  ),
  regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/,
    "Invalid hostname.",
  ),
);

// SMTP Port Schema
const smtpPortSchema = pipe(
  number(),
  custom((value) => {
    if (typeof value !== "number") return false;
    return value >= 1 && value <= 65_535;
  }, "Port must be between 1 and 65535"),
);

// SMTP User Schema
const smtpUserSchema = pipe(
  string(),
  trim(),
  minLength(1, "SMTP username is required"),
  maxLength(255, "SMTP username is too long"),
);

// SMTP Password Schema
const smtpPasswordSchema = pipe(string(), trim(), minLength(1, "SMTP password is required"));

// SMTP From Address Schema (Optional)
const smtpFromSchema = pipe(string(), trim());

// Complete SMTP Configuration Schema
export const smtpConfigSchema = object({
  host: smtpHostSchema,
  port: smtpPortSchema,
  user: smtpUserSchema,
  password: smtpPasswordSchema,
  from: smtpFromSchema,
  secure: boolean(),
});

// --- Database Configuration Schemas ---

// Database Type Schema
const dbTypeSchema = picklist(
  ["mongodb", "mongodb+srv", "postgresql", "mysql", "mariadb", "sqlite"],
  "Invalid database type",
);

// Database Host Schema
const dbHostSchema = pipe(
  string(),
  trim(),
  minLength(1, "Database host is required"),
  maxLength(255, "Database host is too long"),
);

// Database Port Schema (optional for Atlas)
const dbPortSchema = optional(
  pipe(
    string(),
    trim(),
    transform((value) => (value ? Number.parseInt(value, 10) : undefined)),
    custom((value) => {
      if (value === undefined) return true;
      if (typeof value !== "number") return false;
      return value >= 1 && value <= 65_535;
    }, "Port must be between 1 and 65535"),
  ),
);

// Database Name Schema
const dbNameSchema = pipe(
  string(),
  trim(),
  minLength(1, "Database name is required"),
  maxLength(63, "Database name is too long"),
  regex(
    /^[a-zA-Z0-9._-]+$/,
    "Database name can only contain letters, numbers, hyphens, underscores, and dots",
  ),
);

// Database User Schema (optional for MongoDB without auth)
const dbUserSchema = pipe(string(), trim());

// Database Password Schema (optional for MongoDB without auth)
const dbPasswordSchema = pipe(string(), trim());

// Complete Database Configuration Schema — strictObject blocks extra field injection
export const dbConfigSchema = pipe(
  strictObject({
    type: dbTypeSchema,
    host: dbHostSchema,
    port: dbPortSchema,
    name: dbNameSchema,
    user: dbUserSchema,
    password: dbPasswordSchema,
    replicaUrls: optional(array(string())),
  }),
  check((input) => {
    const requiresAuth = ["postgresql", "mysql", "mariadb", "mongodb+srv"];
    return (
      !requiresAuth.includes(input.type) ||
      ((input.user?.length ?? 0) > 0 && (input.password?.length ?? 0) > 0)
    );
  }, "Username and password are required for this database type."),
);

// --- System Settings Schemas ---

// Site Name Schema
const siteNameSchema = pipe(
  string(),
  trim(),
  minLength(1, "Site name is required"),
  maxLength(100, "Site name is too long"),
);

// Production Host Schema
const hostProdSchema = pipe(
  string(),
  trim(),
  minLength(1, "Production URL is required"),
  maxLength(255, "Production URL is too long"),
  regex(/^https?:\/\/.+/, "Production URL must start with http:// or https://"),
);

// Language Code Schema (ISO 639-1 two-letter codes)
const languageCodeSchema = pipe(
  string(),
  trim(),
  transform((value) => value.toLowerCase()),
  regex(/^[a-z]{2}$/, "Language code must be a valid ISO 639-1 two-letter code"),
);

// Complete System Settings Schema
export const systemSettingsSchema = object({
  siteName: siteNameSchema,
  hostProd: hostProdSchema,
  passwordMinLength: optional(number(), 8),
  defaultSystemLanguage: languageCodeSchema,
  defaultContentLanguage: languageCodeSchema,
  systemLanguages: optional(array(languageCodeSchema), ["en"]),
  contentLanguages: optional(array(languageCodeSchema), ["en"]),
  timezone: optional(string(), "UTC"),
  mediaStorageType: optional(picklist(["local", "s3", "r2", "cloudinary"]), "local"),
  mediaFolder: optional(string(), "./mediaFolder"),
  demoMode: optional(boolean(), false),
  multiTenant: optional(boolean(), false),
  useRedis: optional(boolean(), false),
  redisHost: optional(string(), "localhost"),
  redisPort: optional(string(), "6379"),
  redisPassword: optional(string(), ""),
  // Cloudflare CDN
  cfApiToken: optional(string(), ""),
  cfZoneId: optional(string(), ""),
  cfPurgeMode: optional(picklist(["tags", "all"]), "tags"),
});

// --- Schema Definitions for Exports ---
export type LoginFormSchema = InferInput<typeof loginFormSchema>;
export type ForgotFormSchema = InferInput<typeof forgotFormSchema>;
export type ResetFormSchema = InferInput<typeof resetFormSchema>;
export type SignUpFormSchema = InferInput<typeof signUpFormSchema>;
export type AddUserTokenSchema = InferInput<typeof addUserTokenSchema>;
export type ChangePasswordSchema = InferInput<typeof changePasswordSchema>;
export type WidgetEmailSchema = InferInput<typeof widgetEmailSchema>;
export type AddUserSchema = InferInput<typeof addUserSchema>;
export type EditUserSchema = InferInput<typeof editUserSchema>;
export type SetupAdminSchema = InferInput<typeof setupAdminSchema>;
export type SmtpConfigSchema = InferInput<typeof smtpConfigSchema>;
export type DbConfigSchema = InferInput<typeof dbConfigSchema>;
export type SystemSettingsSchema = InferInput<typeof systemSettingsSchema>;
