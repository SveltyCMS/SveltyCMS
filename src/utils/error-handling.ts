/**
 * @file src/utils/errorHandling.ts
 * @description Centralized error handling logic and types for the API.
 * Defines the standard error response shape and utilities for processing errors.
 */

import {
  error as svelteKitError,
  type HttpError,
  isHttpError as svelteKitIsHttpError,
  isRedirect,
  json,
  type RequestEvent,
} from "@sveltejs/kit";
import { logger } from "./logger.ts";
import type { GenericSchema, ValiError } from "valibot";

// Helper to safely get dev mode without crashing if $app/environment is missing (e.g. in some Bun test contexts)
const isDev = (() => {
  try {
    return (import.meta as any).env?.DEV || process.env.NODE_ENV === "development";
  } catch {
    return false;
  }
})();

// --- Maps & Constants ---

/** Module-level status-to-code map — avoids allocation on every raise() call */
const STATUS_CODE_MAP: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_ERROR",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
};

function statusToCode(status: number): string {
  return STATUS_CODE_MAP[status] || `HTTP_${status}`;
}

/**
 * Unified error throwing. Drop-in replacement for SvelteKit's `error()`.
 * Works for page loads (SvelteKit renders +error.svelte) AND API routes
 * (handleApiError extracts the structured code from the body).
 *
 * @example
 * throw raise(404, "User not found");
 * throw raise(500, "DB write failed", "DB_WRITE_FAILED");
 */
export function raise(status: number, message: string, code?: string): never {
  throw svelteKitError(status, {
    message,
    __sveltyCode: code || statusToCode(status),
  } as any);
}

/**
 * Re-throws SvelteKit Redirects and HttpErrors so the framework can handle them.
 * Call at the TOP of every catch block before custom error handling.
 *
 * @example
 * try { await doWork(); }
 * catch (err) {
 *     rethrow(err);
 *     throw raise(500, "Work failed");
 * }
 */
export function rethrow(err: unknown): void {
  if (isRedirect(err) || svelteKitIsHttpError(err)) throw err;
}

// --- Standardized Response Types ---

export interface ApiErrorResponse {
  code?: string;
  issues?: string[]; // Simplified array of strings for validation issues
  message: string;
  stack?: string; // Only included in Development
  success: false;
}

/**
 * Custom Application Error class.
 * Use this to throw expected logic errors (e.g., "User not active")
 * that should return specific HTTP codes and error codes.
 */
export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly originalError?: unknown;

  constructor(
    message: string,
    status = 500,
    code: string | unknown = "INTERNAL_ERROR",
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;

    if (typeof code === "string") {
      this.code = code;
      // If details is an error, treat it as originalError too
      if (details instanceof Error) {
        this.originalError = details;
      }
      this.details = details;
    } else {
      // Legacy/Test support: 3rd arg is originalError
      this.code = "INTERNAL_ERROR";
      this.originalError = code;
      this.details = details;
    }
  }
}

/**
 * Type Guard: Checks if an error is a Valibot validation error.
 */
function isValiError(err: unknown): err is ValiError<GenericSchema> {
  return (
    typeof err === "object" &&
    err !== null &&
    "issues" in err &&
    Array.isArray((err as Record<string, unknown>).issues)
  );
}

/**
 * Formats Valibot issues into a clean array of strings.
 * e.g., "email: Invalid email address"
 */
function formatValibotIssues(err: ValiError<GenericSchema>): string[] {
  return err.issues.map((issue) => {
    const pathKeys = issue.path?.map((p) => (p as { key: string }).key).join(".");
    return pathKeys ? `${pathKeys}: ${issue.message}` : issue.message;
  });
}

/**
 * The Core Error Handler.
 * maps unknown errors to a standardized ApiErrorResponse.
 */
export function handleApiError(err: unknown, event: RequestEvent) {
  // 1. SvelteKit Redirects must be re-thrown to function
  if (isRedirect(err)) {
    throw err;
  }

  let status = 500;
  let message = "Internal Server Error";
  let code = "INTERNAL_SERVER_ERROR";
  let issues: string[] | undefined;

  // 2. Handle Valibot Validation Errors (400)
  if (isValiError(err)) {
    status = 400;
    message = "Validation Failed";
    code = "VALIDATION_ERROR";
    issues = formatValibotIssues(err);

    logger.warn(`API Validation Error [${event.url.pathname}]`, { issues });
  }
  // 3. Handle Custom AppErrors (Harden with name check for cross-bundle resilience)
  else if (isAppError(err)) {
    const appErr = err as AppError;
    status = appErr.status;
    message = appErr.message;
    code = appErr.code;

    // Log 500s as errors, everything else as info/warn
    if (status >= 500) {
      logger.error(`AppError [${event.url.pathname}]: ${message}`, {
        details: appErr.details,
      });
    } else if (status === 401) {
      // Silence noisy unauthorized logs during dev/restarts
      logger.debug(`AppError [${event.url.pathname}]: ${message}`, {
        details: appErr.details,
      });
    } else {
      // Suppress expected 4xx errors during benchmark runs to keep output clean
      if (process.env.SVELTY_BENCHMARK_SUITE === "true" || process.env.BENCHMARK === "true") {
        logger.debug(`AppError [${event.url.pathname}]: ${message}`, {
          details: appErr.details,
        });
      } else {
        logger.warn(`AppError [${event.url.pathname}]: ${message}`, {
          details: appErr.details,
        });
      }
    }
  }
  // 4. Handle SvelteKit HttpErrors (thrown via error() or raise())
  else if (isHttpError(err)) {
    const httpErr = err as HttpError;
    const body = httpErr.body as { message?: string; __sveltyCode?: string } | undefined;
    status = httpErr.status;
    message = body?.message || "HTTP Error";
    code = body?.__sveltyCode || `HTTP_${status}`;

    if (status === 401) {
      logger.debug(`HttpError [${event.url.pathname}]: ${message}`, { status });
    } else {
      logger.warn(`HttpError [${event.url.pathname}]: ${message}`, { status });
    }
  }
  // 5. Catch-all for unknown system errors
  else {
    message = err instanceof Error ? err.message : "An unexpected error occurred.";
    logger.error(`Unhandled API Error [${event.url.pathname}]`, {
      error: message,
      stack: err instanceof Error ? err.stack : undefined,
      user: event.locals.user?._id,
    });
  }

  // Construct standardized response
  const response: ApiErrorResponse = {
    success: false,
    message,
    code,
    issues,
  };

  // Include stack trace in development only for debugging
  if (isDev && err instanceof Error) {
    response.stack = err.stack;
  }

  return json(response, { status });
}

/**
 * Helper to safely extract an error message string from any unknown error object.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }

  // Handle SvelteKit HttpError structure manually to avoid dependency issues
  if (typeof err === "object" && err !== null && "body" in err) {
    const body = (err as { body: { message?: string } }).body;
    if (body?.message) {
      return String(body.message);
    }
  }

  if (typeof err === "object" && err !== null) {
    if ("message" in err) {
      return String((err as { message: string }).message);
    }

    // If object has no message, try to stringify it for better debug info
    try {
      const str = JSON.stringify(err);
      return str === "{}" ? "[object Object]" : str;
    } catch {
      return "[object Object]";
    }
  }

  return String(err);
}

/**
 * Type Guard: Checks if an error is an AppError.
 */
export function isAppError(err: unknown): err is AppError {
  return (
    err instanceof AppError ||
    (typeof err === "object" && err !== null && (err as any).name === "AppError")
  );
}

/**
 * Type Guard: Checks if an error is a SvelteKit HttpError.
 */
export function isHttpError(err: unknown): err is HttpError {
  // Defense-in-depth: check status is a valid HTTP error code (400-599)
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as any).status === "number" &&
    (err as any).status >= 400 &&
    (err as any).status < 600
  );
}

/**
 * Wraps any error into an AppError.
 * Preserves existing AppErrors.
 */
export function wrapError(
  err: unknown,
  message = "An unexpected error occurred",
  status = 500,
): AppError {
  if (isAppError(err)) {
    return err;
  }

  if (isHttpError(err)) {
    const bodyMsg = (err as HttpError & { body?: { message?: string } }).body?.message;
    return new AppError(bodyMsg || message, err.status, `HTTP_${err.status}`, err);
  }

  const errorMsg = getErrorMessage(err);
  // Use default message only if we couldn't get any string representation
  // Note: We intentionally allow "null", "undefined", and "[object Object]" to pass through
  // based on test expectations, although in production we might prefer a fallback.
  const finalMessage = errorMsg || message;

  return new AppError(finalMessage, status, "INTERNAL_ERROR", err);
}
