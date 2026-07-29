/**
 * @file src/utils/errors.ts
 * @description Centralized error types for architectural safety.
 *
 * Provides explicit error classes for context violations, path traversal
 * attempts, and system integrity failures — making the CMS fail-fast and
 * debuggable rather than silently falling back to incorrect defaults.
 */

export class ContextMissingError extends Error {
  constructor(
    message = "SveltyContext is not initialized. Ensure request is wrapped in runWithContext.",
  ) {
    super(message);
    this.name = "ContextMissingError";
  }
}

export class PathTraversalError extends Error {
  constructor(targetPath: string, baseDir: string) {
    super(
      `Path traversal detected: "${targetPath}" is outside the allowed directory "${baseDir}".`,
    );
    this.name = "PathTraversalError";
  }
}

export class IntegrityError extends Error {
  constructor(path: string, reason: string) {
    super(`System integrity check failed for "${path}": ${reason}`);
    this.name = "IntegrityError";
  }
}
