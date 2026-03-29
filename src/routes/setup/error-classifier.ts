/**
 * @file src/routes/setup/error-classifier.ts
 * @description
 * Intelligent error classification and mapping for the Setup Wizard.
 * Translates low-level database and system errors into actionable user feedback.
 *
 * Responsibilities include:
 * - Parsing structured error objects from multiple database adapters.
 * - Identifying specific failure modes (auth, networking, DNS, Atlas-specific).
 * - Generating user-friendly troubleshooting suggestions.
 * - Protecting internal stack traces from direct exposure in the UI.
 *
 * ### Features:
 * - multi-adapter error normalization
 * - MongoDB Atlas-specific heuristics
 * - structured classification payloads
 * - localized error message mapping
 * - safe recursive error decomposition
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
  | "UNKNOWN";

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
    // Use the user-friendly message as the primary error message
    super(classified.userFriendly);
    this.name = "SetupDatabaseError";
    this.classification = classified.classification;
    this.userFriendly = classified.userFriendly;
    this.hint = classified.hint;

    // Preserve original error details for server-side logging
    if (originalError) {
      this.cause = originalError;
      // Extract specifics if available (e.g., MongoDB error codes)
      this.details =
        originalError instanceof Error
          ? {
              message: originalError.message,
              name: originalError.name,
              stack: process.env.NODE_ENV === "development" ? originalError.stack : undefined,
            }
          : originalError;
    }

    // Ensure proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SetupDatabaseError);
    }
  }

  /**
   * Sanitizes the error for transmission to the client.
   * Excludes sensitive details like internal stack traces.
   */
  public toClientPayload() {
    return {
      success: false,
      error: this.userFriendly,
      classification: this.classification,
      hint: this.hint,
      // We only send dbDoesNotExist flag for specific classification to trigger UI modals
      dbDoesNotExist: this.classification === "DB_NOT_FOUND",
    };
  }

  /**
   * Static helper to wrap any error into a SetupDatabaseError using a classifier.
   */
  public static fromError(
    error: unknown,
    classifier: (err: unknown) => ClassifiedError,
  ): SetupDatabaseError {
    if (error instanceof SetupDatabaseError) return error;
    return new SetupDatabaseError(classifier(error), error);
  }
}

export interface ClassifyContext {
  isSrv?: boolean;
  host?: string;
  name?: string;
}

/**
 * Pure function that inspects a raw error and returns a structured ClassifiedError.
 * No side effects, easy to test.
 */
export function classifyDatabaseError(
  err: unknown,
  context: ClassifyContext = {},
): ClassifiedError {
  // Better extraction of raw error message - try to find the "real" error in details
  let raw = "";
  if (err instanceof Error) {
    raw = err.message;
  } else if (typeof err === "object" && err !== null) {
    const msg = (err as any).message;
    const details = (err as any).details;
    // If message is just a generic "Failed to..." prefix, prioritize the specific details
    if (msg && details && typeof details === "string" && String(msg).includes("Failed to")) {
      raw = details;
    } else {
      raw = `${msg || ""} ${typeof details === "string" ? details : ""}`.trim();
    }
    if (!raw) raw = String(err);
  } else {
    raw = String(err);
  }

  const lower = raw.toLowerCase();

  // Try to find a code at multiple levels (top level, or nested in structured responses)
  const code =
    (err as { code?: string | number })?.code ??
    (err as { originalCode?: string | number })?.originalCode ??
    "";

  // Log for server-side troubleshooting with more details
  logger.error("🔍 Classifying database error:", {
    code,
    originalCode: (err as any)?.originalCode,
    message: raw,
    context,
  });

  // 1. Connection Refused / Host Unreachable
  if (
    code === "ECONNREFUSED" ||
    code === "DB_CONNECTION_FAILED" ||
    lower.includes("connection refused") ||
    lower.includes("failed to connect to server") ||
    lower.includes("econnrefused")
  ) {
    const hostHint =
      context.host === "localhost" || context.host === "127.0.0.1"
        ? "Check if your database service is running locally. If using Docker, ensure the container is up and you are using the correct network gateway."
        : `Check if host "${context.host}" is correct and reachable through your network/firewall.`;

    return {
      classification: "CONNECTION_REFUSED",
      userFriendly: "The database server refused the connection.",
      hint: `1. Verify the database service is running.\n2. ${hostHint}\n3. Check if the port matches the database configuration.`,
      raw,
    };
  }

  if (code === "ENOTFOUND" || lower.includes("getaddrinfo enotfound")) {
    return {
      classification: "HOST_UNREACHABLE",
      userFriendly: "Database host could not be found.",
      hint: `1. Check your hostname for typos: "${context.host}".\n2. Verify your DNS settings or internet connection.\n3. If using MongoDB Atlas, ensure you are using the full cluster URI.`,
      raw,
    };
  }

  // 1.5. Timeout / Network Unreachable
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("network is unreachable") ||
    lower.includes("etimedout") ||
    code === "ETIMEDOUT"
  ) {
    return {
      classification: "CONNECTION_REFUSED",
      userFriendly: "Database connection timed out or network is unreachable.",
      hint: "1. Check your internet connection.\n2. Verify if the database server is under heavy load.\n3. Ensure your firewall isn't blocking the connection.",
      raw,
    };
  }

  // 2. Authentication Failures
  if (
    lower.includes("auth failed") ||
    lower.includes("authentication failed") ||
    lower.includes("requires authentication") ||
    lower.includes("bad auth") ||
    lower.includes("not authorized") ||
    lower.includes("access denied") ||
    code === 18 || // MongoDB Auth failed
    code === "28P01" || // Postgres invalid_password
    code === 13 // MongoDB NotAuthorized
  ) {
    let userFriendly = "Database authentication failed.";

    if (lower.includes("requires authentication")) {
      userFriendly =
        "The database requires authentication, but no username/password was provided or they are incorrect.";
    } else if (lower.includes("not authorized") || lower.includes("access denied")) {
      userFriendly = `The provided user does not have permission to access the "${context.name}" database.`;
    } else if (lower.includes("bad auth") || lower.includes("auth failed")) {
      userFriendly = "Invalid database username or password.";
    }

    const srvNote = context.isSrv
      ? 'Note: SRV connections often require the "admin" database as the auth source.'
      : "";
    return {
      classification: "AUTH_FAILED",
      userFriendly,
      hint: `1. Double-check your username and password.\n2. Verify if the user has permissions for the "${context.name}" database.\n3. ${srvNote}`,
      raw,
    };
  }

  // 2.5 Atlas Specific / IP Whitelisting
  if (lower.includes("atlas") || lower.includes("whitelist") || lower.includes("ip address")) {
    return {
      classification: "CONNECTION_REFUSED",
      userFriendly: "Connection rejected by MongoDB Atlas.",
      hint: '1. Ensure your current IP address is added to the "Network Access" whitelist in MongoDB Atlas.\n2. Check if your Atlas cluster is currently active.',
      raw,
    };
  }

  // 2.6 SSL/TLS Issues
  if (lower.includes("ssl") || lower.includes("tls") || lower.includes("certificate")) {
    return {
      classification: "INVALID_CONFIG",
      userFriendly: "Database SSL/TLS handshake failed.",
      hint: "1. Check if the database requires a secure connection.\n2. Verify if you need to provide a CA certificate.\n3. For MongoDB Atlas, ensure you are using the correct connection string format.",
      raw,
    };
  }

  // 3. Database Not Found
  if (
    (lower.includes("database") &&
      (lower.includes("not found") ||
        lower.includes("unknown") ||
        lower.includes("does not exist") ||
        lower.includes("no such database"))) ||
    code === "3D000" // Postgres database_does_not_exist
  ) {
    return {
      classification: "DB_NOT_FOUND",
      userFriendly: `The database "${context.name}" was not found.`,
      hint: `1. Check for typos in the database name.\n2. SveltyCMS can attempt to create it for you—would you like to try?`,
      raw,
    };
  }

  // 4. Missing Drivers / Dependencies
  if (lower.includes("cannot find module") || lower.includes("driver not found")) {
    return {
      classification: "DRIVER_MISSING",
      userFriendly: "Required database driver is not installed.",
      hint: '1. Click "Install Missing Drivers" in the UI.\n2. Or run `npm install <driver-name>` in your terminal.\n3. Restart the development server.',
      raw,
    };
  }

  // 5. Permission Denied
  if (lower.includes("permission denied") || lower.includes("eacces") || code === "EACCES") {
    return {
      classification: "PERMISSION_DENIED",
      userFriendly: "Access to the database was denied by the OS.",
      hint: "1. Check file permissions if using SQLite.\n2. Ensure the system user running SveltyCMS has read/write access to the database folder.",
      raw,
    };
  }

  // 6. SQLite Specifics
  if (lower.includes("sqlite_cantopen")) {
    return {
      classification: "INVALID_CONFIG",
      userFriendly: "Cannot open SQLite database file.",
      hint: "1. Ensure the directory path exists.\n2. Check if the path is absolute or relative to the project root.",
      raw,
    };
  }

  // Fallback for everything else
  return {
    classification: "UNKNOWN",
    userFriendly: `Unexpected Database Error: ${raw}`,
    hint: "Check the server logs for the full stack trace and technical details.",
    raw,
  };
}

/**
 * Maps a generic DbErrorClassification to a short UI banner message.
 */
export function getBannerForClassification(classification: DbErrorClassification): string {
  const banners: Record<DbErrorClassification, string> = {
    CONNECTION_REFUSED: "Server unreachable",
    AUTH_FAILED: "Invalid credentials",
    DB_NOT_FOUND: "Database missing",
    HOST_UNREACHABLE: "Host not found",
    INVALID_CONFIG: "Configuration error",
    DRIVER_MISSING: "Drivers required",
    PERMISSION_DENIED: "Permission denied",
    UNKNOWN: "Connection error",
  };
  return banners[classification] || banners.UNKNOWN;
}
