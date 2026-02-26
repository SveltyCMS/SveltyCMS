/** @file src/content/collection-scanner.ts @description Standalone collection scanner for setup and production optimization features: [recursive filesystem scanning, cross-platform path normalization, parallel module processing, widget registry pre-initialization] */

import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@utils/logger';
import type { Schema } from './types';
import { processModule } from './utils';

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
			}
			if (entry.isFile() && entry.name.endsWith('.js')) {
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

	const finalPath = withoutExt.split(path.sep).join('/');
	return finalPath.startsWith('/') ? finalPath : `/${finalPath}`;
}

/**
 * Scans the compiledCollections directory and returns all collection schemas.
 * This is a standalone version that doesn't requirecontent-manageror dbAdapter.
 *
 * @returns Array of collection schemas found in the filesystem
 */
export async function scanCompiledCollections(): Promise<Schema[]> {
	const envDir = process.env.COLLECTIONS_DIR || process.env.COLLECTIONS_FOLDER || import.meta.env.VITE_COLLECTIONS_FOLDER || '.compiledCollections';

	// Resolve to absolute path to ensure we look in the project root
	const compiledDirectoryPath = path.resolve(process.cwd(), envDir);

	// Pre-initialize widget registry to ensure globalThis.widgets is ready for processModule
	try {
		const { widgetRegistryService } = await import('@src/services/widget-registry-service');
		await widgetRegistryService.initialize();
	} catch (error) {
		logger.error('Failed to initializewidget-registry-serviceduring collection scan', error);
		// Continue anyway, processModule might still work for some schemas or have its own fallback
	}

	try {
		await fs.access(compiledDirectoryPath);
	} catch {
		logger.trace(`Compiled collections directory not found at: ${compiledDirectoryPath}. Assuming fresh start.`);
		return [];
	}

	// Get only relevant JS files
	const files = await recursivelyGetFiles(compiledDirectoryPath);

	// Process files in parallel
	const schemaPromises: Promise<Schema | null>[] = files.map(async (filePath) => {
		try {
			const content = await fs.readFile(filePath, 'utf-8');
			const moduleData = await processModule(content);

			if (!moduleData?.schema) {
				return null;
			}

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
