/**
 * @file src/utils/validation.ts
 * @description Validation utilities using Valibot.
 */

import { logger } from "@utils/logger";
import { safeParse, type BaseIssue, type BaseSchema } from "valibot";

/**
 * Validates data against a Valibot schema, returning field errors or null if valid.
 */
export function validateValibot<T>(
  schema: BaseSchema<T, T, BaseIssue<unknown>>,
  value?: T,
): null | { [P in keyof T]?: string[] } {
  try {
    const result = safeParse(schema, value);

    if (result.success) {
      return null;
    }

    const fieldErrors = {} as { [P in keyof T]?: string[] };

    for (const issue of result.issues) {
      const path = issue.path?.[0]?.key as keyof T;
      if (path) {
        fieldErrors[path] = fieldErrors[path] || [];
        fieldErrors[path]?.push(issue.message);
      }
    }

    return fieldErrors;
  } catch (error) {
    logger.error("Validation error:", error);
    return null;
  }
}
