/**
 * @file src/utils/compilation/types.ts
 * @description Type definitions for the compilation system.
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
  sourcePath: string;
  sourceHash: string;
  compiledAt: number;
  tenantId?: string | null;
}

export interface CompilationResult {
  duration: number;
  errors: Array<{ file: string; error: Error }>;
  /** List of orphaned compiled files that no longer have a source file */
  orphanedFiles: string[];
  processed: number;
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

export interface CompileWarning {
  file: string;
  message: string;
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
