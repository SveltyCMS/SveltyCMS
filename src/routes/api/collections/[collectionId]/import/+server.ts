/**
 * @file src/routes/api/collections/[collectionId]/import/+server.ts
 * @description API endpoint for importing data into a specific collection
 *
 * Features:
 * - Import data into specific collection
 * - Support for JSON and CSV formats
 * - Data validation and error reporting
 * - Batch processing for large datasets
 * - Permission-based access control
 *
 * Usage:
 * POST /api/collections/{collectionId}/import
 * Body: { data: [...], format: 'json|csv', options: {...} }
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Database adapter
import { dbAdapter } from '@src/databases/db';

// Content Management
import { contentManager } from '@src/content/ContentManager';
import type { CollectionEntry, Schema } from '@src/content/types';

// System Logger
import { logger } from '@utils/logger.server';

interface ImportOptions {
	overwrite?: boolean;
	validate?: boolean;
	skipInvalid?: boolean;
	batchSize?: number;
	csvHeaders?: string[];
	csvDelimiter?: string;
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const startTime = performance.now();
	const { collectionId } = params;

	try {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}

		// Get collection schema
		const schema = await contentManager.getCollection(collectionId);

		if (!schema) {
			throw error(404, `Collection '${collectionId}' not found`);
		}

		// Parse request body
		const body = await request.json();
		const { data, format = 'json', options = {} } = body;

		if (!data) {
			throw error(400, 'No data provided for import');
		}

		// Validate and parse options
		const importOptions: ImportOptions = {
			overwrite: options.overwrite ?? false,
			validate: options.validate ?? true,
			skipInvalid: options.skipInvalid ?? true,
			batchSize: options.batchSize ?? 100,
			csvHeaders: options.csvHeaders,
			csvDelimiter: options.csvDelimiter ?? ','
		};

		logger.info(`Starting import into collection \x1b[33m${collectionId}\x1b[0m`, {
			userId: locals.user._id,
			format,
			dataLength: Array.isArray(data) ? data.length : 'unknown',
			options: importOptions
		});

		// Process data based on format
		let entries: Record<string, unknown>[];

		if (format === 'csv') {
			entries = parseCSVData(data, importOptions);
		} else {
			entries = Array.isArray(data) ? data : [data];
		}

		// Import the entries
		const result = await importEntries(`collection_${schema._id}`, entries, schema, importOptions);

		const duration = performance.now() - startTime;

		logger.info(`Collection import completed for \x1b[33m${collectionId}\x1b[0m`, {
			userId: locals.user._id,
			imported: result.imported,
			skipped: result.skipped,
			errors: result.errors.length,
			duration: `${duration.toFixed(2)}ms`
		});

		return json({
			success: result.errors.length === 0 || (result.imported > 0 && importOptions.skipInvalid),
			collection: collectionId,
			imported: result.imported,
			skipped: result.skipped,
			errors: result.errors,
			duration,
			message:
				result.errors.length === 0
					? `Successfully imported ${result.imported} entries`
					: `Import completed with ${result.errors.length} errors. ${result.imported} entries imported, ${result.skipped} skipped.`
		});
	} catch (err) {
		const duration = performance.now() - startTime;
		const errorMsg = err instanceof Error ? err.message : 'Unknown error';
		logger.error(`Collection import failed for \x1b[33m${collectionId}\x1b[0m`, {
			userId: locals.user?._id,
			error: errorMsg,
			duration: `${duration.toFixed(2)}ms`
		});

		if (typeof err === 'object' && err !== null && 'status' in err && 'body' in err) {
			throw err;
		}

		throw error(500, `Import failed: ${errorMsg}`);
	}
};

/**
 * Parse CSV data into array of objects
 */
function parseCSVData(csvData: string, options: ImportOptions): CollectionEntry[] {
	const lines = csvData.split('\n').filter((line) => line.trim());

	if (lines.length === 0) {
		return [];
	}

	// Get headers
	const headers = options.csvHeaders || parseCSVLine(lines[0], options.csvDelimiter);
	const dataStartIndex = options.csvHeaders ? 0 : 1;

	const entries = [];

	for (let i = dataStartIndex; i < lines.length; i++) {
		const values = parseCSVLine(lines[i], options.csvDelimiter);

		if (values.length !== headers.length) {
			logger.warn(`CSV line ${i + 1} has \x1b[33m${values.length}\x1b[0m values but expected \x1b[33m${headers.length}\x1b[0m`);
			continue;
		}

		const entry: Record<string, string> = {};
		headers.forEach((header, index) => {
			entry[header.trim()] = values[index]?.trim() || '';
		});

		entries.push(entry);
	}

	return entries;
}

/**
 * Parse a single CSV line respecting quoted values
 */
function parseCSVLine(line: string, delimiter: string = ','): string[] {
	const values = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];

		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				// Escaped quote
				current += '"';
				i++; // Skip next quote
			} else {
				// Toggle quote state
				inQuotes = !inQuotes;
			}
		} else if (char === delimiter && !inQuotes) {
			// Field separator
			values.push(current);
			current = '';
		} else {
			current += char;
		}
	}

	// Add final value
	values.push(current);

	return values;
}

async function importEntries(collectionName: string, entries: CollectionEntry[], schema: Schema, options: ImportOptions) {
	const result: {
		imported: number;
		skipped: number;
		errors: Array<{ index: number; error: string; entry: CollectionEntry }>;
	} = {
		imported: 0,
		skipped: 0,
		errors: []
	};

	// Process entries in batches
	const batchSize = options.batchSize || 100;

	for (let i = 0; i < entries.length; i += batchSize) {
		const batch = entries.slice(i, i + batchSize);

		for (let j = 0; j < batch.length; j++) {
			const entry = batch[j];
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
				const entryData = {
					...entry,
					// Remove potential conflicting fields
					_id: undefined,
					__v: undefined,
					// Ensure metadata
					createdAt: entry.createdAt || new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					status: entry.status || 'draft'
				};

				// Check for existing entry
				if (!dbAdapter) {
					throw new Error('Database adapter not initialized');
				}

				let existingEntry = null;
				if (entry._id || entry.id) {
					const searchId = entry._id || entry.id;
					const searchResult = await dbAdapter.crud.findOne(collectionName, {
						_id: searchId
					} as any);
					if (searchResult.success && searchResult.data) {
						existingEntry = searchResult.data;
					}
				}

				// Handle existing entries
				if (existingEntry) {
					if (options.overwrite) {
						const updateResult = await dbAdapter.crud.update(collectionName, existingEntry._id, entryData);

						if (updateResult.success) {
							result.imported++;
						} else {
							result.errors.push({
								index: entryIndex,
								error: `Failed to update: ${updateResult.error}`,
								entry
							});
						}
					} else {
						result.skipped++;
					}
				} else {
					// Create new entry
					const createResult = await dbAdapter.crud.insertOne(collectionName, entryData);

					if (createResult.success) {
						result.imported++;
					} else {
						result.errors.push({
							index: entryIndex,
							error: `Failed to create: ${createResult.error}`,
							entry
						});
					}
				}
			} catch (entryError) {
				result.errors.push({
					index: entryIndex,
					error: entryError instanceof Error ? entryError.message : 'Unknown error',
					entry
				});
			}
		}
	}

	return result;
}

/**
 * Validate entry against schema
 */
function validateEntry(entry: CollectionEntry, schema: Schema): { isValid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (!entry || typeof entry !== 'object') {
		errors.push('Entry must be an object');
		return { isValid: false, errors };
	}

	// Check required fields
	if (schema.fields) {
		for (const field of schema.fields) {
			// Handle both FieldInstance and WidgetPlaceholder types
			const fieldDef = typeof field === 'object' && field !== null && 'db_fieldName' in field ? field : null;
			if (fieldDef && 'required' in fieldDef && fieldDef.required && 'db_fieldName' in fieldDef) {
				const fieldName = String(fieldDef.db_fieldName);
				if (!entry[fieldName]) {
					const label = 'label' in fieldDef ? fieldDef.label : fieldName;
					errors.push(`Required field '${label || fieldName}' is missing`);
				}
			}
		}
	}

	return {
		isValid: errors.length === 0,
		errors
	};
}
