/**
 * @file src/services/sdk/safe-call.ts
 * @description Standardizes SDK error handling — converts thrown errors to DatabaseResult.
 *
 * Usage:
 *   return await safeCall(async () => auth.authenticate(...));
 *   // Returns { success: true, data: ... } or { success: false, message: "..." }
 */
import type { DatabaseResult, DatabaseError } from "@src/databases/db-interface";
import { AppError, getErrorMessage } from "@utils/error-handling";

export async function safeCall<T>(
  fn: () => Promise<T>,
  context?: string,
): Promise<DatabaseResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return {
        success: false,
        message: err.message,
        error: {
          // AppError.code is always a string (constructor default "INTERNAL_ERROR");
          // the fallback is dead at runtime but kept as an allocation-free guard.
          code: err.code ?? "APP_ERROR",
          message: err.message,
          statusCode: err.status,
        },
      };
    }
    return {
      success: false,
      message: context ? `${context}: ${getErrorMessage(err)}` : getErrorMessage(err),
      error: err as DatabaseError,
    };
  }
}
