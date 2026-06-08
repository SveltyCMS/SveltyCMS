/**
 * @file src/utils/security/mongo-sanitize.ts
 * @description MongoDB query sanitizer that blocks dangerous operators to prevent NoSQL injection.
 *
 * Blocks operators that can execute arbitrary code or enable injection attacks:
 * - $where — allows arbitrary JavaScript execution
 * - $function — allows JavaScript function definitions in aggregation pipelines
 * - $expr — allows aggregation expressions that can bypass standard query logic
 * - $regex — allowed but validated to prevent catastrophic backtracking (ReDoS)
 *
 * This utility recursively sanitizes all levels of nested MongoDB queries,
 * including arrays, $or/$and/$nor conditions, and deeply nested objects.
 */

import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";

/** Operators that are unconditionally blocked in all MongoDB queries. */
const BLOCKED_OPERATORS = new Set([
  "$where",
  "$function",
  "$expr",
  "$accumulator", // MongoDB 4.4+ — allows arbitrary JS
]);

/** Maximum allowed length for $regex patterns to prevent ReDoS. */
const MAX_REGEX_LENGTH = 500;

/**
 * Recursively sanitizes a MongoDB query object, stripping blocked operators.
 * Throws AppError(400) on detection of dangerous operators for defense-in-depth.
 *
 * @param obj — The query object to sanitize (mutated in-place for performance)
 * @param path — The current key path (for error messages)
 * @returns The sanitized object
 */
export function sanitizeMongoQuery(obj: any, path: string = "$"): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = sanitizeMongoQuery(obj[i], `${path}[${i}]`);
    }
    return obj;
  }

  for (const key of Object.keys(obj)) {
    const currentPath = `${path}.${key}`;

    if (BLOCKED_OPERATORS.has(key)) {
      logger.error(`[MongoSanitize] Blocked dangerous operator: ${key} at ${currentPath}`);
      throw new AppError(
        `Query contains forbidden operator: ${key}`,
        400,
        "NOSQL_INJECTION_BLOCKED",
      );
    }

    if (key === "$regex") {
      const val = obj[key];
      if (typeof val === "string" && val.length > MAX_REGEX_LENGTH) {
        throw new AppError(
          `Regex pattern too long (${val.length} > ${MAX_REGEX_LENGTH})`,
          400,
          "REGEX_TOO_LONG",
        );
      }
    }

    // Recursively sanitize nested objects
    if (obj[key] !== null && typeof obj[key] === "object") {
      obj[key] = sanitizeMongoQuery(obj[key], currentPath);
    }
  }

  return obj;
}
