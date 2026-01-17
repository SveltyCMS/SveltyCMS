/**
 * @file shared/utils/src/compilation/types.ts
 * @description Type definitions for the compilation system.
 */

export interface CompileOptions {
	/** Directory containing source TypeScript collection files */
	userCollections?: string;
	/** Directory for outputting compiled JavaScript files */
	compiledCollections?: string;
	/** Optional specific file to compile (relative to userCollections) */
	targetFile?: string;
	/** Optional system collections directory (if different from default) */
	systemCollections?: string;
	/** Logger interface for build process feedback */
	logger?: Logger;
	/** Concurrency limit for file processing */
	concurrency?: number;
}

export interface Logger {
	info(message: string): void;
	success?(message: string): void;
	warn(message: string): void;
	error(message: string, error?: unknown): void;
}

export interface ExistingFileData {
	jsPath: string;
	uuid: string | null;
	hash: string | null;
}

export interface CompilationResult {
	processed: number;
	skipped: number;
	errors: Array<{ file: string; error: Error }>;
	duration: number;
	/** List of orphaned compiled files that no longer have a source file */
	orphanedFiles: string[];
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
}

export class CompilationError extends Error {
	constructor(
		message: string,
		public file?: string,
		public originalError?: unknown
	) {
		super(message);
		this.name = 'CompilationError';
	}
}
