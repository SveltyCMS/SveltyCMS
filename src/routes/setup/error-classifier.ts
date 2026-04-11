/**
 * @file src/routes/setup/error-classifier.ts
 * @description
 * Intelligent error classification and mapping for the Setup Wizard.
 * Translates low-level database and system errors into actionable user feedback.
 */

import { logger } from "@utils/logger.server";

export type DbErrorClassification =
  | "CONNECTION_REFUSED"
  | "AUTH_FAILED"
  | "DB_NOT_FOUND"
  | "HOST_UNREACHABLE"
  | "INVALID_CONFIG"
  | "DRIVER_MISSING"
  | "PERMISSION_DENIED"
  | "CASE_MISMATCH"
  | "UNKNOWN"
  | string;

export interface ClassifiedError {
  classification: DbErrorClassification;
  userFriendly: string;
  hint?: string;
  raw: string;
}

/**
 * Custom error class used during the setup wizard to provide
 * structured feedback to the frontend.
 */
export class SetupDatabaseError extends Error {
  public readonly classification: DbErrorClassification;
  public readonly hint?: string;
  public readonly userFriendly: string;
  public readonly details?: unknown;

  constructor(classified: ClassifiedError, originalError?: unknown) {
    super(classified.userFriendly);
    this.name = "SetupDatabaseError";
    this.classification = classified.classification;
    this.userFriendly = classified.userFriendly;
    this.hint = classified.hint;

    if (originalError) {
      this.cause = originalError;
      this.details =
        originalError instanceof Error
          ? {
              message: originalError.message,
              name: originalError.name,
              stack: process.env.NODE_ENV === "development" ? originalError.stack : undefined,
            }
          : originalError;
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SetupDatabaseError);
    }
  }

  public toClientPayload() {
    return {
      success: false,
      error: this.userFriendly,
      classification: this.classification,
      hint: this.hint,
      dbDoesNotExist:
        this.classification === "DB_NOT_FOUND" || this.classification === "database_not_found",
    };
  }
}

/**
 * Pure function that inspects a raw error and returns a structured ClassifiedError.
 */
export function classifyDatabaseError(
  err: unknown,
  engine: "mongodb" | "postgres" | "mysql" | "sqlite",
  dbConfig?: { user?: string; password?: string; host?: string; name?: string },
): ClassifiedError {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  // MongoDB specific code 13297
  const code = (err as { code?: string | number })?.code ?? "";

  logger.error("🔍 Classifying database error:", { raw, code, engine });

  // 0. Case Mismatch (MongoDB specific 13297)
  if (code === 13297 || lower.includes("db already exists with different case")) {
    const existingName = lower.match(/already have: \[([^\]]+)\]/)?.[1] || "sveltycms";
    return {
      classification: "CASE_MISMATCH",
      userFriendly: `Database "${dbConfig?.name}" conflicts with an existing database named "${existingName}".`,
      hint: `MongoDB is case-sensitive on this system. You must either:\n1. Use the existing name: "${existingName}"\n2. Manually drop the existing "${existingName}" database from your MongoDB server if you want to use "${dbConfig?.name}".`,
      raw,
    };
  }

  // Common patterns
  if (/authentication failed|auth.*fail|bad auth|authentication.*error/i.test(lower)) {
    return {
      classification: "AUTH_FAILED",
      userFriendly: "Authentication failed. Please check your username and password.",
      hint: "Verify your credentials and ensure the user has access to the target database.",
      raw,
    };
  }

  if (/econnrefused|connection refused/i.test(lower) || code === "ECONNREFUSED") {
    return {
      classification: "CONNECTION_REFUSED",
      userFriendly: "Connection refused. The database server may be down or unreachable.",
      hint: `Check if your ${engine} service is running and accessible at ${dbConfig?.host}.`,
      raw,
    };
  }

  if (
    /database.*not found|db.*not found|unknown database/i.test(lower) ||
    code === "3D000" ||
    code === "ER_BAD_DB_ERROR"
  ) {
    return {
      classification: "DB_NOT_FOUND",
      userFriendly: `The database "${dbConfig?.name}" was not found.`,
      hint: "SveltyCMS can attempt to create it for you if your user has sufficient permissions.",
      raw,
    };
  }

  // Fallback to simpler classification if no specific pattern matches
  return {
    classification: code ? String(code) : "UNKNOWN",
    userFriendly: `Database connection failed: ${raw}`,
    hint: "Check the server logs for technical details.",
    raw,
  };
}
