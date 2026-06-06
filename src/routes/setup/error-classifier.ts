/**
 * @file src/routes/setup/error-classifier.ts
 * @description
 * Intelligent error classification and mapping for the Setup Wizard.
 * Translates low-level database and system errors into actionable user feedback.
 */

import { logger } from "@utils/logger";

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
  canOverwrite?: boolean;
  details?: any;
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
  public readonly canOverwrite?: boolean;
  public readonly details?: any;

  constructor(classified: ClassifiedError, originalError?: unknown) {
    super(classified.userFriendly);
    this.name = "SetupDatabaseError";
    this.classification = classified.classification;
    this.userFriendly = classified.userFriendly;
    this.hint = classified.hint;
    this.canOverwrite = classified.canOverwrite;
    this.details = classified.details;

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
      canOverwrite: this.canOverwrite,
      details: this.details,
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
  const raw = (err as any)?.message || String(err);
  const lower = raw.toLowerCase();

  // MongoDB specific code 13297
  const code = (err as any)?.code ?? "";

  logger.error("🔍 Classifying database error:", { raw, code, engine });

  // 3. Case Mismatch (MongoDB specific or generic)
  if (code === 13297 || lower.includes("db already exists with different case")) {
    const existingName = raw.match(/already have: \[([^\]]+)\]/i)?.[1] || "SveltyCMS";
    return {
      classification: "CASE_MISMATCH",
      userFriendly: `A database named '<span class="text-tertiary-500 dark:text-primary-500 font-bold">${existingName}</span>' already exists. On this system, database names are case-insensitive, so you cannot create '${dbConfig?.name}'.`,
      hint: "Use the existing name exactly, or choose a completely different name, or choose to overwrite.",
      canOverwrite: true,
      details: { existingName },
      raw,
    };
  }

  // 4. DB Already Exists (Matched case but not empty)
  if (
    lower.includes("database is not empty") ||
    lower.includes("database not empty") ||
    lower.includes("db already exists")
  ) {
    return {
      classification: "DB_ALREADY_EXISTS",
      userFriendly: `Database '<span class="text-tertiary-500 dark:text-primary-500 font-bold">${dbConfig?.name}</span>' already exists and contains data.`,
      hint: "SveltyCMS requires a fresh database. Please choose a different name or confirm you want to OVERWRITE (this will delete all existing tables).",
      canOverwrite: true,
      raw,
    };
  }

  // Common patterns
  if (
    /authentication failed|auth.*fail|bad auth|authentication.*error|not authorized|bad login/i.test(
      lower,
    )
  ) {
    return {
      classification: "AUTH_FAILED",
      userFriendly: "Authentication failed. Please check your username and password.",
      hint: "The provided user does not have permission to access this database or the password is incorrect.",
      raw,
    };
  }

  if (
    /econnrefused|connection refused|unreachable|network is unreachable/i.test(lower) ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    lower.includes("getaddrinfo")
  ) {
    return {
      classification: "CONNECTION_REFUSED",
      userFriendly:
        "Connection refused. The database server may be down, unreachable, or the hostname is invalid.",
      hint: `Check if your ${engine} service is running and accessible at ${dbConfig?.host}. If using a cloud provider (Atlas/Azure/AWS), ensure your IP is whitelisted.`,
      raw,
    };
  }

  if (
    /timed out|timeout|selection timed out/i.test(lower) ||
    code === "ETIMEDOUT" ||
    code === "PROTOCOL_CONNECTION_LOST"
  ) {
    return {
      classification: "CONNECTION_REFUSED",
      userFriendly: "Connection timed out. The database server is taking too long to respond.",
      hint: "Verify your network connection and ensure the database server is not overloaded or blocked by a firewall.",
      raw,
    };
  }

  if (/ssl|tls|certificate|handshake/i.test(lower)) {
    return {
      classification: "INVALID_CONFIG",
      userFriendly: "SSL/TLS connection error. Failed to establish a secure connection.",
      hint: "Check your SSL/TLS certificates and ensure the server supports the required encryption protocol.",
      raw,
    };
  }

  if (
    /database.*not found|db.*not found|unknown database|does not exist/i.test(lower) ||
    code === "3D000" ||
    code === "ER_BAD_DB_ERROR" ||
    (engine === "sqlite" && lower.includes("does not exist"))
  ) {
    return {
      classification: "DB_NOT_FOUND",
      userFriendly: `The database "<span class="text-tertiary-500 font-bold dark:text-primary-500">${dbConfig?.name}</span>" was not found.`,
      hint: "SveltyCMS can attempt to create it for you if your user has sufficient permissions.",
      raw,
    };
  }

  if (/not allowed to connect|ip address.*not allowed/i.test(lower)) {
    return {
      classification: "CONNECTION_REFUSED",
      userFriendly:
        "Connection refused. This server's IP address is not whitelisted in MongoDB Atlas.",
      hint: "Go to MongoDB Atlas -> Network Access and add your current IP address to the whitelist.",
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
