/**
 * @file shared/utils/src/content/scanner.ts
 * @description Standalone collection scanner for use during setup
 *
 * This module provides a simplified collection scanning function that can be used
 * during system setup without requiring the full ContentManager or global dbAdapter.
 *
 * ## Usage Contexts:
 * 1. **Setup Process** - Scans collections during initial system setup (`/api/setup/seed`)
 * 2. **Production Runtime** - Optimized filesystem scanning for better performance (`src/content/index.ts`)
 * 3. **Build Time** - Development-time collection scanning (Vite plugin)
 *
 * ## Testing:
 * This module is tested indirectly through:
 * - **Setup API Tests** (`tests/bun/api/setup.test.ts`) - Tests the seed endpoint which uses scanCompiledCollections
 * - **Integration Tests** - Runtime usage is tested through collection-related integration tests
 *
 * Direct unit testing is complex because processModule() requires WidgetRegistryService initialization,
 * which depends on Vite's import.meta.glob (not available in test environment).
 *
 * NOTE: This is SERVER-ONLY code that uses Node.js fs module.
 */

import { logger } from '@shared/utils/logger';
import fs from 'node:fs/promises';
import path from 'node:path';
import { processModule } from './utils';
import type { Schema } from '@shared/database/dbInterface';

/**
 * Recursively scans a directory for .js files.
 * Uses path.join for cross-platform compatibility.
 */
async function recursivelyGetFiles(dir: string): Promise<string[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true });

	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = path.join(dir, entry.name);

			if (entry.isDirectory()) {
				return recursivelyGetFiles(fullPath);
			} else if (entry.isFile() && entry.name.endsWith('.js')) {
				return [fullPath];
			}
			return [];
		})
	);

	return files.flat();
}

/**
 * Extracts a clean content path relative to the collections folder.
 * Ensures the result always uses forward slashes '/' for database consistency.
 */
function extractCollectionPath(fullPath: string, baseDir: string): string {
	// Get relative path: e.g., "subfolder/myCollection.js" or "subfolder\myCollection.js"
	const relative = path.relative(baseDir, fullPath);

	// Remove extension
	const withoutExt = relative.replace(/\.js$/, '');

	// Normalize separators to forward slashes (essential for DB consistency across OS)
	return withoutExt.split(path.sep).join('/');
}

/**
 * Scans the compiledCollections directory and returns all collection schemas.
 * This is a standalone version that doesn't require ContentManager or dbAdapter.
 *
 * @returns Array of collection schemas found in the filesystem
 */
export async function scanCompiledCollections(): Promise<Schema[]> {
	const envDir = process.env.COLLECTIONS_DIR || process.env.COLLECTIONS_FOLDER || import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections';

	// Resolve to absolute path - start with current working directory
	let compiledDirectoryPath = path.resolve(process.cwd(), envDir);

	// Check if directory exists
	let exists = false;
	try {
		await fs.access(compiledDirectoryPath);
		exists = true;
	} catch {
		// If not found in CWD, check if we are in an app directory (monorepo) and valid path exists at root
		const rootPath = path.resolve(process.cwd(), '../../', envDir);
		try {
			await fs.access(rootPath);
			logger.info(`Found compiled collections at workspace root: ${rootPath}`);
			compiledDirectoryPath = rootPath;
			exists = true;
		} catch {
			// Still not found
		}
	}

	if (!exists) {
		logger.trace(`Compiled collections directory not found at: ${compiledDirectoryPath} or workspace root. Assuming fresh start.`);
		return [];
	}

	// Get only relevant JS files
	const files = await recursivelyGetFiles(compiledDirectoryPath);

	// Process files in parallel
	const schemaPromises: Promise<Schema | null>[] = files.map(async (filePath) => {
		try {
			const content = await fs.readFile(filePath, 'utf-8');
			const moduleData = await processModule(content);

			if (!moduleData?.schema) return null;

			const schema = moduleData.schema as Schema;

			// Generate clean path relative to the root collection folder
			const collectionPath = extractCollectionPath(filePath, compiledDirectoryPath);

			// Use file name as fallback name if schema doesn't provide one
			const fileName = path.basename(filePath, '.js');

			return {
				...schema,
				_id: schema._id!, // The _id from the file is the source of truth
				path: collectionPath, // Directory structure determines path
				name: schema.name || fileName,
				tenantId: schema.tenantId ?? undefined
			} as Schema;
		} catch (error) {
			logger.warn(`Could not process collection file: ${filePath}`, error);
			return null;
		}
	});

	const results = await Promise.all(schemaPromises);
	const schemas = results.filter((s): s is Schema => s !== null);

	logger.trace(`Scanned ${schemas.length} collection schemas from filesystem.`);
	return schemas;
}
