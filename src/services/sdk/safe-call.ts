/**
 * @file src/services/sdk/safe-call.ts
 * @description Standardizes SDK error handling — converts thrown errors to DatabaseResult.
 *
 * Usage:
 *   return await safeCall(async () => auth.authenticate(...));
 *   // Returns { success: true, data: ... } or { success: false, message: "..." }
 */
import type { DatabaseResult } from "@src/databases/db-interface";
import { AppError, getErrorMessage } from "@utils/error-handling";

export async function safeCall<T>(
  fn: () => Promise<T>,
  context?: string,
): Promise<DatabaseResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (err: any) {
    if (err instanceof AppError) {
      return {
        success: false,
        message: err.message,
        error: { code: (err as any).code, status: err.status },
      };
    }
    return {
      success: false,
      message: context ? `${context}: ${getErrorMessage(err)}` : getErrorMessage(err),
      error: err,
    };
  }
}
