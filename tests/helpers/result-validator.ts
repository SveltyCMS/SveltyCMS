/**
 * @file tests/helpers/result-validator.ts
 * @description Runtime contract validator for DatabaseResult<T> responses.
 *
 * Every adapter method promises to return DatabaseResult<T>. This validator
 * enforces the structural contract at runtime, catching adapters that deviate
 * from the expected shape.
 *
 * ### What gets validated:
 * - .success must be boolean
 * - On success: result must be a valid object
 * - On failure: .error.code must be a string, .message must exist
 * - .meta is optional (many internal operations use skipMeta)
 * - .data is optional on success (delete/update may omit it)
 *
 * ### Features:
 * - Structural validation of DatabaseResult shape
 * - Type checking for .success (must be boolean)
 * - Error shape validation on failure
 * - Descriptive error messages with operation context
 */

import { expect } from "vitest";

export interface ValidationOptions {
  /** Operation name for error messages (e.g., "insert", "findOne") */
  operation: string;
  /** If true, .data may be null/undefined on success (e.g., findOne miss) */
  allowNullData?: boolean;
  /** If true, .data is not required on success (e.g., delete, update) */
  dataOptional?: boolean;
}

/**
 * Validates that a value conforms to the DatabaseResult<T> contract.
 *
 * ### Usage:
 * ```typescript
 * const result = await adapter.crud.insert("posts", data, opts);
 * validateDatabaseResult(result, { operation: "insert" });
 * ```
 */
export function validateDatabaseResult(result: unknown, options: ValidationOptions): void {
  const { operation, allowNullData = false, dataOptional = false } = options;

  // 1. Must be an object (not null, not undefined)
  expect(
    result,
    `[${operation}] DatabaseResult must be an object, got ${typeof result}`,
  ).toBeDefined();
  expect(typeof result, `[${operation}] DatabaseResult must be an object`).toBe("object");
  if (result === null) {
    throw new Error(`[${operation}] DatabaseResult is null`);
  }

  const r = result as Record<string, any>;

  // 2. Must have .success boolean
  expect(
    typeof r.success,
    `[${operation}] DatabaseResult.success must be boolean, got ${typeof r.success}`,
  ).toBe("boolean");

  if (r.success) {
    // 3a. On success: .data validation (if required)
    if (!dataOptional) {
      if (!allowNullData) {
        expect(
          r,
          `[${operation}] DatabaseResult.data must exist on successful result`,
        ).toHaveProperty("data");
      } else {
        // data key must exist (even if undefined/null)
        expect(
          Object.prototype.hasOwnProperty.call(r, "data"),
          `[${operation}] DatabaseResult must have 'data' property on success`,
        ).toBe(true);
      }
    }
  } else {
    // 3b. On failure: .error.code must be a string
    if (r.error) {
      expect(
        typeof r.error.code,
        `[${operation}] DatabaseResult.error.code must be a string, got ${typeof r.error?.code}`,
      ).toBe("string");
    }
    // Must have at least .message or .error.message
    const hasMessage = typeof r.message === "string" && r.message.length > 0;
    const hasErrorMsg = r.error && typeof r.error.message === "string";
    expect(
      hasMessage || hasErrorMsg,
      `[${operation}] DatabaseResult must have .message or .error.message on failure`,
    ).toBe(true);
  }
}

/**
 * Assert that a DatabaseResult is successful and extract its data.
 */
export function assertDatabaseSuccess<T>(result: unknown, options: ValidationOptions): T {
  validateDatabaseResult(result, options);
  const r = result as Record<string, any>;
  if (!r.success) {
    throw new Error(
      `[${options.operation}] Expected success but got failure: ${r.message || r.error?.message || "unknown"}`,
    );
  }
  return r.data as T;
}

/**
 * Assert that a DatabaseResult is a failure and extract its error.
 */
export function assertDatabaseFailure(
  result: unknown,
  options: ValidationOptions,
): { code: string; message: string; details?: any } {
  validateDatabaseResult(result, options);
  const r = result as Record<string, any>;
  if (r.success) {
    throw new Error(`[${options.operation}] Expected failure but got success`);
  }
  return r.error || { code: "UNKNOWN", message: r.message || "Unknown error" };
}
