/**
 * @file src/utils/compilation/types.ts
 * @description Type definitions for the compilation system.
 *
 * Manifest entries use relative paths (portable across CI/dev machines).
 * Fingerprint-driven invalidation catches transformer changes, not just sources.
 */

export interface CompileOptions {
  /** Directory for outputting compiled JavaScript files */
  compiledCollections?: string;
  /** Concurrency limit for file processing */
  concurrency?: number;
  /** Logger interface for build process feedback */
  logger?: Logger;
  /** Optional specific file to compile (relative to userCollections) */
  targetFile?: string;
  /** Tenant ID for multi-tenant mode (undefined/null = global resource) */
  tenantId?: string | null;
  /** Directory containing source TypeScript collection files */
  userCollections?: string;
}

export interface Logger {
  error(message: string, error?: unknown): void;
  info(message: string): void;
  success?(message: string): void;
  warn(message: string): void;
}

export interface ManifestEntry {
  /** Relative path to the source file (from userCollections) */
  sourcePath: string;
  sourceHash: string;
  compiledAt: number;
  tenantId?: string | null;
  /** Direct source file dependencies (relative paths) for invalidation */
  deps?: string[];
}

export interface CompilationResult {
  duration: number;
  errors: Array<{ file: string; error: Error }>;
  /** List of orphaned compiled files that no longer have a source file */
  orphanedFiles: string[];
  processed: number;
  /** Where tenant source roots were resolved from */
  resolvedFrom?: "flat" | "tenant" | "tenant-fallback" | "flat-fallback";
  /** Schema warnings detected during compilation (breaking changes) */
  schemaWarnings: Array<{
    file: string;
    changes: Array<{
      type: string;
      fieldName: string;
      message: string;
      dataLoss: boolean;
    }>;
  }>;
  skipped: number;
}

export class CompilationError extends Error {
  constructor(
    message: string,
    public file?: string,
    public originalError?: unknown,
  ) {
    super(message);
    this.name = "CompilationError";
  }
}
