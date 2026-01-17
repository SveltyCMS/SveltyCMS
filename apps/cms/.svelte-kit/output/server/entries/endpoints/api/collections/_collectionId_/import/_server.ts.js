import { error, json } from '@sveltejs/kit';
import { d as dbAdapter } from '../../../../../../chunks/db.js';
import { contentManager } from '../../../../../../chunks/ContentManager.js';
import { l as logger } from '../../../../../../chunks/logger.server.js';
const POST = async ({ params, request, locals }) => {
	const startTime = performance.now();
	const { collectionId } = params;
	try {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}
		const schema = await contentManager.getCollection(collectionId);
		if (!schema) {
			throw error(404, `Collection '${collectionId}' not found`);
		}
		const body = await request.json();
		const { data, format = 'json', options = {} } = body;
		if (!data) {
			throw error(400, 'No data provided for import');
		}
		const importOptions = {
			overwrite: options.overwrite ?? false,
			validate: options.validate ?? true,
			skipInvalid: options.skipInvalid ?? true,
			batchSize: options.batchSize ?? 100,
			csvHeaders: options.csvHeaders,
			csvDelimiter: options.csvDelimiter ?? ','
		};
		logger.info(`Starting import into collection ${collectionId}`, {
			userId: locals.user._id,
			format,
			dataLength: Array.isArray(data) ? data.length : 'unknown',
			options: importOptions
		});
		let entries;
		if (format === 'csv') {
			entries = parseCSVData(data, importOptions);
		} else {
			entries = Array.isArray(data) ? data : [data];
		}
		const result = await importEntries(`collection_${schema._id}`, entries, schema, importOptions);
		const duration = performance.now() - startTime;
		logger.info(`Collection import completed for ${collectionId}`, {
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
		logger.error(`Collection import failed for ${collectionId}`, {
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
function parseCSVData(csvData, options) {
	const lines = csvData.split('\n').filter((line) => line.trim());
	if (lines.length === 0) {
		return [];
	}
	const headers = options.csvHeaders || parseCSVLine(lines[0], options.csvDelimiter);
	const dataStartIndex = options.csvHeaders ? 0 : 1;
	const entries = [];
	for (let i = dataStartIndex; i < lines.length; i++) {
		const values = parseCSVLine(lines[i], options.csvDelimiter);
		if (values.length !== headers.length) {
			logger.warn(`CSV line ${i + 1} has ${values.length} values but expected ${headers.length}`);
			continue;
		}
		const entry = {};
		headers.forEach((header, index) => {
			entry[header.trim()] = values[index]?.trim() || '';
		});
		entries.push(entry);
	}
	return entries;
}
function parseCSVLine(line, delimiter = ',') {
	const values = [];
	let current = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (char === delimiter && !inQuotes) {
			values.push(current);
			current = '';
		} else {
			current += char;
		}
	}
	values.push(current);
	return values;
}
async function importEntries(collectionName, entries, schema, options) {
	const result = {
		imported: 0,
		skipped: 0,
		errors: []
	};
	const batchSize = options.batchSize || 100;
	for (let i = 0; i < entries.length; i += batchSize) {
		const batch = entries.slice(i, i + batchSize);
		for (let j = 0; j < batch.length; j++) {
			const entry = batch[j];
			const entryIndex = i + j;
			try {
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
				const entryData = {
					...entry,
					// Remove potential conflicting fields
					_id: void 0,
					__v: void 0,
					// Ensure metadata
					createdAt: entry.createdAt || /* @__PURE__ */ new Date().toISOString(),
					updatedAt: /* @__PURE__ */ new Date().toISOString(),
					status: entry.status || 'draft'
				};
				if (!dbAdapter) {
					throw new Error('Database adapter not initialized');
				}
				let existingEntry = null;
				if (entry._id || entry.id) {
					const searchId = entry._id || entry.id;
					const searchResult = await dbAdapter.crud.findOne(collectionName, {
						_id: searchId
					});
					if (searchResult.success && searchResult.data) {
						existingEntry = searchResult.data;
					}
				}
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
					const { _id, createdAt, updatedAt, ...insertData } = entryData;
					const createResult = await dbAdapter.crud.insert(collectionName, insertData);
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
function validateEntry(entry, schema) {
	const errors = [];
	if (!entry || typeof entry !== 'object') {
		errors.push('Entry must be an object');
		return { isValid: false, errors };
	}
	if (schema.fields) {
		for (const field of schema.fields) {
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
export { POST };
//# sourceMappingURL=_server.ts.js.map
