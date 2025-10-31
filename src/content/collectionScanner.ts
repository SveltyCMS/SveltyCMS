/**
 * @file src/content/collectionScanner.ts
 * @description Standalone collection scanner for use during setup
 *
 * This module provides a simplified collection scanning function that can be used
 * during system setup without requiring the full ContentManager or global dbAdapter.
 */

import { logger } from '@utils/logger.server';
import * as fs from 'node:fs/promises';
import { processModule } from './utils';
import type { Schema } from './types';

/**
 * Recursively scans a directory for .js files
 */
async function recursivelyGetFiles(dir: string): Promise<string[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = `${dir}/${entry.name}`;
			if (entry.isDirectory()) {
				return recursivelyGetFiles(fullPath);
			} else {
				return [fullPath];
			}
		})
	);
	return files.flat();
}

/**
 * Extracts a clean path from a file path for content structure
 */
function extractPathFromFilePath(filePath: string): string {
	const compiledDir = import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections';
	const withoutCompiledDir = filePath.replace(new RegExp(`^${compiledDir}/?`), '');
	const withoutExtension = withoutCompiledDir.replace(/\.js$/, '');
	return withoutExtension.replace(/\\/g, '/');
}

/**
 * Scans the compiledCollections directory and returns all collection schemas
 * This is a standalone version that doesn't require ContentManager or dbAdapter
 *
 * @returns Array of collection schemas found in the filesystem
 */
export async function scanCompiledCollections(): Promise<Schema[]> {
	const compiledDirectoryPath = import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections';

	try {
		await fs.access(compiledDirectoryPath);
	} catch {
		logger.trace(`Compiled collections directory not found: ${compiledDirectoryPath}. Assuming fresh start.`);
		return [];
	}

	const files = await recursivelyGetFiles(compiledDirectoryPath);
	const schemaPromises = files
		.filter((file) => file.endsWith('.js'))
		.map(async (filePath) => {
			try {
				const content = await fs.readFile(filePath, 'utf-8');
				const moduleData = await processModule(content);
				if (!moduleData?.schema) return null;

				const schema = moduleData.schema as Schema;
				const path = extractPathFromFilePath(filePath);
				const fileName = filePath.split('/').pop()?.replace('.js', '') ?? 'unknown';

				return {
					...schema,
					_id: schema._id!, // The _id from the file is the source of truth
					path: path,
					name: schema.name || fileName,
					tenantId: schema.tenantId ?? undefined
				};
			} catch (error) {
				logger.warn(`Could not process collection file: ${filePath}`, error);
				return null;
			}
		});

	const schemas = (await Promise.all(schemaPromises)).filter((s): s is NonNullable<typeof s> => !!s);
	logger.trace(`Scanned \x1b[33m${schemas.length}\x1b[0m collection schemas from filesystem.`);
	return schemas;
}
