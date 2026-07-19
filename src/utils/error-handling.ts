/**
 * @file src/utils/error-handling.ts
 * @description Centralized error handling logic and types for the API.
 *
 * ### Hardening (audit 2026-07):
 * - Production scrubs raw system errors to prevent infrastructure leakage
 * - Valibot path parsing handles numeric array indices gracefully
 * - `getErrorMessage` guards against cyclic references via WeakSet
 * - `isHttpError` checks `body` for cross-bundle resilience
 * - `AppError` constructor captures stack traces via `Error.captureStackTrace`
 */

import { isRedirect, json, type RequestEvent, type HttpError } from "@sveltejs/kit";
import { logger } from "./logger.ts";
import type { GenericSchema, ValiError } from "valibot";

const isDev = (() => {
  try {
    return (import.meta as any).env?.DEV || process.env.NODE_ENV === "development";
  } catch {
    return false;
  }
})();

// ─── Standardized response types ────────────────────────────────────────

export interface ApiErrorResponse {
  code: string;
  issues?: string[];
  message: string;
  stack?: string;
  success: false;
}

/**
 * Custom Application Error class.
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

    // Preserve V8 stack traces in environments that support it
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    if (typeof code === "string") {
      this.code = code;
      if (details instanceof Error) {
        this.originalError = details;
      }
      this.details = details;
    } else {
      this.code = "INTERNAL_ERROR";
      this.originalError = code;
      this.details = details;
    }
  }
}

// ─── Type guards ────────────────────────────────────────────────────────

function isValiError(err: unknown): err is ValiError<GenericSchema> {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as any).name === "ValiError" &&
    "issues" in err &&
    Array.isArray((err as Record<string, unknown>).issues)
  );
}

/**
 * Formats Valibot issues into clean messages, supporting nested objects
 * and numeric array index keys (e.g., "users.0.email").
 */
function formatValibotIssues(err: ValiError<GenericSchema>): string[] {
  return err.issues.map((issue) => {
    if (!issue.path) return issue.message;

    const pathKeys = issue.path
      .map((p: any) => p.key)
      .filter((key) => key !== undefined && key !== null)
      .join(".");

    return pathKeys ? `${pathKeys}: ${issue.message}` : issue.message;
  });
}

// ─── Core handler ──────────────────────────────────────────────────────

export function handleApiError(err: unknown, event: RequestEvent) {
  if (isRedirect(err)) {
    throw err;
  }

  let status = 500;
  let message = "Internal Server Error";
  let code = "INTERNAL_SERVER_ERROR";
  let issues: string[] | undefined;

  const requestPath = event.url.pathname;

  if (isValiError(err)) {
    status = 400;
    message = "Validation Failed";
    code = "VALIDATION_ERROR";
    issues = formatValibotIssues(err);
    logger.warn(`API Validation Error [${requestPath}]`, { issues });
  } else if (isAppError(err)) {
    status = err.status;
    message = err.message;
    code = err.code;

    if (status >= 500) {
      logger.error(`AppError [${requestPath}]: ${message}`, {
        code,
        details: err.details,
        originalError: getErrorMessage(err.originalError),
      });
      // 🛡️ Scrub detailed system messages in production
      if (!isDev) {
        message = "An internal server error occurred.";
      }
    } else if (status === 401) {
      logger.debug(`AppError [${requestPath}]: Unauthorized access attempt`);
    } else {
      const isBenchmark =
        process.env.SVELTY_BENCHMARK_SUITE === "true" || process.env.BENCHMARK === "true";
      if (!isBenchmark) {
        logger.warn(`AppError [${requestPath}]: ${message}`, { code, details: err.details });
      }
    }
  } else if (isHttpError(err)) {
    const body = err.body as { message?: string; __sveltyCode?: string } | undefined;
    status = err.status;
    message = body?.message || "HTTP Error";
    code = body?.__sveltyCode || `HTTP_${status}`;

    if (status === 401) {
      logger.debug(`HttpError [${requestPath}]: Unauthorized`);
    } else {
      logger.warn(`HttpError [${requestPath}]: ${message}`, { status, code });
    }
  } else {
    const isNativeError = err instanceof Error;
    const systemMessage = isNativeError ? err.message : String(err);

    logger.error(`Unhandled API Error [${requestPath}]`, {
      error: systemMessage,
      stack: isNativeError ? err.stack : undefined,
      user: event.locals.user?._id,
    });

    // 🛡️ Never leak raw engine errors in production
    if (!isDev) {
      message = "An unexpected error occurred.";
      code = "UNEXPECTED_SYSTEM_ERROR";
    } else {
      message = systemMessage;
      code = isNativeError ? err.name.toUpperCase() : "UNKNOWN_RAW_ERROR";
    }
  }

  const response: ApiErrorResponse = {
    success: false,
    message,
    code,
    ...(issues && { issues }),
  };

  if (isDev && err instanceof Error) {
    response.stack = err.stack;
  }

  return json(response, { status });
}

// ─── Helpers ────────────────────────────────────────────────────────────

export function getErrorMessage(err: unknown): string {
  if (!err) return "";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;

  if (typeof err === "object" && "body" in err) {
    const body = (err as any).body;
    if (body?.message) return String(body.message);
  }

  if (typeof err === "object") {
    if ("message" in err) return String((err as any).message);

    // 🛡️ Guard against massive/cyclic objects causing OOM on stringify
    try {
      const seen = new WeakSet();
      const str = JSON.stringify(err, (_, value) => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) return "[Circular]";
          seen.add(value);
        }
        return value;
      });
      return str === "{}" ? "[object Object]" : str;
    } catch {
      return "[object Object]";
    }
  }

  return String(err);
}

export function raise(status: number, message: string, code?: string): never {
  throw new AppError(message, status, code);
}

export function isAppError(err: unknown): err is AppError {
  return (
    err instanceof AppError ||
    (typeof err === "object" && err !== null && (err as any).name === "AppError")
  );
}

export function isHttpError(err: unknown): err is HttpError {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as any).status === "number" &&
    "body" in err &&
    (err as any).status >= 400 &&
    (err as any).status < 600
  );
}

/**
 * Re-throws redirects and HTTP errors so SvelteKit can handle them
 * natively. For all other errors, this is a no-op. Call at the top of
 * every catch block to prevent accidental wrapping of framework signals.
 */
export function rethrow(err: unknown): void {
  if (isRedirect(err) || isHttpError(err)) throw err;
}

export function wrapError(
  error: unknown,
  message = "An unexpected error occurred",
  status = 500,
): AppError {
  if (isAppError(error)) return error;

  if (isHttpError(error)) {
    const bodyMsg = (error as any).body?.message;
    return new AppError(bodyMsg || message, error.status, `HTTP_${error.status}`, error);
  }

  const errorMsg = getErrorMessage(error);
  return new AppError(errorMsg || message, status, "INTERNAL_ERROR", error);
}
