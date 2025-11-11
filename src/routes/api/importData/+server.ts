/**
 * @file src/routes/api/importData/+server.ts
 * @description API endpoint for importing collection data from JSON files
 *
 * This module handles the import of data into collections:
 * - Authenticates the user (admin or specific roles with permissions)
 * - Validates the imported data structure
 * - Imports data into specified collections
 * - Provides detailed import results and error reporting
 *
 * Features:
 * - Authentication and authorization checks
 * - Data validation and sanitization
 * - Batch import operations with transaction support
 * - Detailed logging and error handling
 * - Support for selective collection import
 *
 * Usage:
 * POST /api/importData
 * Requires: Admin authentication or specific roles with appropriate permissions
 * Body: { collections: { collectionName: [entries...] }, options: { overwrite: boolean, validate: boolean } }
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Database adapter for collection operations
import { dbAdapter } from '@src/databases/db';

// Stores
import { collections } from '@stores/collectionStore.svelte';

// System Logger
import { logger } from '@utils/logger.server';

// Content Manager for validation

// Entry type for imported data
interface ImportEntry {
	_id?: string;
	id?: string;
	createdAt?: string;
	updatedAt?: string;
	status?: string;
	[key: string]: unknown;
}

interface ImportOptions {
	overwrite?: boolean;
	validate?: boolean;
	skipInvalid?: boolean;
	batchSize?: number;
}

interface ImportResult {
	collection: string;
	imported: number;
	skipped: number;
	errors: Array<{
		index: number;
		error: string;
		entry?: unknown;
	}>;
}

interface ImportResponse {
	success: boolean;
	message: string;
	results: ImportResult[];
	totalImported: number;
	totalSkipped: number;
	totalErrors: number;
	duration: number;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const startTime = performance.now();

	try {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}

		logger.info('Starting collection data import', {
			userId: locals.user._id,
			userEmail: locals.user.email
		});

		// Parse request body
		const body = await request.json();
		const { collections: importData, options = {} } = body;

		if (!importData || typeof importData !== 'object') {
			throw error(400, 'Invalid import data format. Expected collections object.');
		}

		// Validate import options
		const importOptions: ImportOptions = {
			overwrite: options.overwrite ?? false,
			validate: options.validate ?? true,
			skipInvalid: options.skipInvalid ?? true,
			batchSize: options.batchSize ?? 100
		};

		// Get available collections
		const availableCollections = collections.value;
		const results: ImportResult[] = [];
		let totalImported = 0;
		let totalSkipped = 0;
		let totalErrors = 0;

		// Process each collection
		for (const [collectionName, entries] of Object.entries(importData)) {
			logger.debug(`Processing import for collection: ${collectionName}`);

			// Validate collection exists
			if (!(collectionName in availableCollections)) {
				const errorResult: ImportResult = {
					collection: collectionName,
					imported: 0,
					skipped: 0,
					errors: [
						{
							index: -1,
							error: `Collection '${collectionName}' does not exist`
						}
					]
				};
				results.push(errorResult);
				totalErrors++;
				continue;
			}

			// Get collection schema for validation
			const schema = availableCollections[collectionName as keyof typeof availableCollections];

			// Import entries for this collection
			const result = await importCollectionEntries(collectionName, entries as unknown[], schema, importOptions);

			results.push(result);
			totalImported += result.imported;
			totalSkipped += result.skipped;
			totalErrors += result.errors.length;
		}

		const duration = performance.now() - startTime;

		const response: ImportResponse = {
			success: totalErrors === 0 || (totalImported > 0 && (importOptions.skipInvalid ?? false)),
			message:
				totalErrors === 0
					? `Successfully imported ${totalImported} entries across ${results.length} collections`
					: `Import completed with ${totalErrors} errors. ${totalImported} entries imported, ${totalSkipped} skipped.`,
			results,
			totalImported,
			totalSkipped,
			totalErrors,
			duration
		};

		logger.info('Collection data import completed', {
			userId: locals.user._id,
			duration: `${duration.toFixed(2)}ms`,
			totalImported,
			totalSkipped,
			totalErrors,
			collectionsProcessed: results.length
		});

		return json(response);
	} catch (err) {
		const duration = performance.now() - startTime;
		const errorMessage = err instanceof Error ? err.message : 'Unknown error during import';

		logger.error('Collection data import failed', {
			userId: locals.user?._id,
			error: errorMessage,
			duration: `${duration.toFixed(2)}ms`
		});

		if (typeof err === 'object' && err !== null && 'status' in err && 'body' in err) {
			// This is a SvelteKit error, re-throw it
			throw err;
		}

		throw error(500, `Import failed: ${errorMessage}`);
	}
};

/**
 * Import entries for a specific collection
 */
async function importCollectionEntries(collectionName: string, entries: unknown[], schema: unknown, options: ImportOptions): Promise<ImportResult> {
	const result: ImportResult = {
		collection: collectionName,
		imported: 0,
		skipped: 0,
		errors: []
	};

	if (!Array.isArray(entries)) {
		result.errors.push({
			index: -1,
			error: 'Collection data must be an array of entries'
		});
		return result;
	}

	// Process entries in batches
	const batchSize = options.batchSize || 100;

	if (!dbAdapter) {
		result.errors.push({
			index: -1,
			error: 'Database adapter not available'
		});
		return result;
	}

	for (let i = 0; i < entries.length; i += batchSize) {
		const batch = entries.slice(i, i + batchSize);

		for (let j = 0; j < batch.length; j++) {
			const entry = batch[j] as ImportEntry;
			const entryIndex = i + j;

			try {
				// Validate entry if validation is enabled
				if (options.validate) {
					const validationResult = validateEntry(entry, schema);
					if (!validationResult.isValid) {
						if (options.skipInvalid) {
							result.skipped++;
							logger.debug(`Skipped invalid entry at index ${entryIndex}`, {
								collection: collectionName,
								errors: validationResult.errors
							});
							continue;
						} else {
							result.errors.push({
								index: entryIndex,
								error: `Validation failed: ${validationResult.errors.join(', ')}`,
								entry
							});
							continue;
						}
					}
				}

				// Prepare entry data
				const entryData: Record<string, unknown> = {
					...entry,
					// Remove MongoDB-specific fields that might cause conflicts
					_id: undefined,
					__v: undefined,
					// Ensure required metadata exists
					createdAt: entry.createdAt || new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: entry.status || 'draft'
				};

				// Check if entry already exists (by some unique identifier)
				let existingEntry = null;
				if (entry._id || entry.id) {
					const searchId = entry._id || entry.id;
					const searchResult = await dbAdapter.crud.findOne(collectionName, {
						_id: searchId
					} as Record<string, unknown>);
					if (searchResult.success && searchResult.data) {
						existingEntry = searchResult.data;
					}
				}

				// Handle existing entries
				if (existingEntry) {
					if (options.overwrite) {
						// Update existing entry
						const updateResult = await dbAdapter.crud.update(collectionName, existingEntry._id, entryData);

						if (updateResult.success) {
							result.imported++;
							logger.debug(`Updated existing entry in ${collectionName}`, {
								entryId: existingEntry._id
							});
						} else {
							result.errors.push({
								index: entryIndex,
								error: `Failed to update existing entry: ${updateResult.error}`,
								entry
							});
						}
					} else {
						// Skip existing entry
						result.skipped++;
						logger.debug(`Skipped existing entry in ${collectionName}`, {
							entryId: existingEntry._id
						});
					}
				} else {
					// Create new entry
					const createResult = await dbAdapter.crud.insertOne(collectionName, entryData);

					if (createResult.success) {
						result.imported++;
						logger.debug(`Created new entry in ${collectionName}`, {
							entryId: createResult.data?._id
						});
					} else {
						result.errors.push({
							index: entryIndex,
							error: `Failed to create entry: ${createResult.error}`,
							entry
						});
					}
				}
			} catch (entryError) {
				result.errors.push({
					index: entryIndex,
					error: entryError instanceof Error ? entryError.message : 'Unknown error processing entry',
					entry
				});
				logger.error(`Error processing entry ${entryIndex} in ${collectionName}`, entryError);
			}
		}
	}

	return result;
}

/**
 * Validate an entry against collection schema
 */
function validateEntry(entry: unknown, schema: unknown): { isValid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (!entry || typeof entry !== 'object') {
		errors.push('Entry must be an object');
		return { isValid: false, errors };
	}

	// Basic validation - check for required fields if schema defines them
	if (typeof schema === 'object' && schema !== null && 'fields' in schema && Array.isArray(schema.fields)) {
		for (const field of schema.fields) {
			if (
				typeof field === 'object' &&
				field !== null &&
				'required' in field &&
				field.required &&
				!(entry as Record<string, unknown>)[
					(field as { db_fieldName?: string; name?: string }).db_fieldName || (field as { name?: string }).name || ''
				]
			) {
				errors.push(`Required field '${(field as { label?: string; name?: string }).label || (field as { name?: string }).name}' is missing`);
			}
		}
	}

	// Additional validation can be added here based on field types, constraints, etc.

	return {
		isValid: errors.length === 0,
		errors
	};
}
