import { json } from '@sveltejs/kit';
import { g as getDb, d as dbAdapter } from '../../../../../chunks/db.js';
import { getAllSettings, invalidateSettingsCache } from '../../../../../chunks/settingsService.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { d as decryptData } from '../../../../../chunks/crypto.js';
async function decryptSensitiveData(encryptedData, password) {
	try {
		return await decryptData(encryptedData, password);
	} catch {
		throw new Error('Failed to decrypt sensitive data. Password may be incorrect.');
	}
}
async function validateImportData(data) {
	const errors = [];
	const warnings = [];
	if (!data.metadata) {
		errors.push({
			path: 'metadata',
			message: 'Missing required metadata',
			code: 'MISSING_METADATA'
		});
	} else {
		if (!data.metadata.exported_at) {
			errors.push({
				path: 'metadata.exported_at',
				message: 'Missing export timestamp',
				code: 'MISSING_TIMESTAMP'
			});
		}
		if (!data.metadata.cms_version) {
			warnings.push({
				path: 'metadata.cms_version',
				message: 'Missing CMS version - compatibility cannot be verified',
				code: 'MISSING_VERSION'
			});
		}
	}
	if (data.settings) {
		if (typeof data.settings !== 'object') {
			errors.push({
				path: 'settings',
				message: 'Settings must be an object',
				code: 'INVALID_SETTINGS_TYPE'
			});
		} else {
			for (const [key, value] of Object.entries(data.settings)) {
				if (key === '' || key === null || key === void 0) {
					errors.push({
						path: `settings.${key}`,
						message: 'Invalid setting key',
						code: 'INVALID_SETTING_KEY'
					});
				}
				if (value === null || value === void 0) {
					warnings.push({
						path: `settings.${key}`,
						message: 'Setting has null or undefined value',
						code: 'NULL_SETTING_VALUE'
					});
				}
			}
		}
	}
	if (data.collections) {
		if (!Array.isArray(data.collections)) {
			errors.push({
				path: 'collections',
				message: 'Collections must be an array',
				code: 'INVALID_COLLECTIONS_TYPE'
			});
		} else {
			data.collections.forEach((collection, index) => {
				if (!collection.id) {
					errors.push({
						path: `collections[${index}].id`,
						message: 'Collection missing required id',
						code: 'MISSING_COLLECTION_ID'
					});
				}
				if (!collection.name) {
					errors.push({
						path: `collections[${index}].name`,
						message: 'Collection missing required name',
						code: 'MISSING_COLLECTION_NAME'
					});
				}
			});
		}
	}
	if (!data.settings && !data.collections) {
		warnings.push({
			path: 'root',
			message: 'Export contains no settings or collections',
			code: 'EMPTY_EXPORT'
		});
	}
	return {
		valid: errors.length === 0,
		errors,
		warnings
	};
}
async function detectConflicts(importData) {
	const conflicts = [];
	if (importData.settings) {
		const currentSettings = await getAllSettings();
		for (const [key, importValue] of Object.entries(importData.settings)) {
			const currentValue = currentSettings[key];
			if (currentValue !== void 0) {
				if (JSON.stringify(currentValue) !== JSON.stringify(importValue)) {
					conflicts.push({
						type: 'setting',
						key,
						current: currentValue,
						import: importValue,
						recommendation: 'overwrite'
					});
				}
			}
		}
	}
	if (importData.collections);
	logger.info(`Detected ${conflicts.length} conflicts`);
	return conflicts;
}
function mergeValues(current, imported) {
	if (typeof current === 'object' && typeof imported === 'object' && current !== null && imported !== null) {
		if (Array.isArray(current) && Array.isArray(imported)) {
			return [.../* @__PURE__ */ new Set([...current, ...imported])];
		}
		return { ...current, ...imported };
	}
	return imported;
}
async function applyImport(importData, options, conflicts) {
	const result = {
		success: true,
		imported: 0,
		skipped: 0,
		merged: 0,
		errors: [],
		conflicts
	};
	const db = getDb();
	if (!db) {
		result.success = false;
		result.errors.push({
			key: 'database',
			message: 'Database connection not available',
			code: 'DB_ERROR'
		});
		return result;
	}
	if (importData.settings) {
		for (const [key, value] of Object.entries(importData.settings)) {
			const conflict = conflicts.find((c) => c.key === key);
			if (conflict) {
				if (options.strategy === 'skip') {
					logger.debug(`Skipping conflicted setting: ${key}`);
					result.skipped++;
					continue;
				}
				if (options.strategy === 'merge') {
					const mergedValue = mergeValues(conflict.current, conflict.import);
					try {
						await db.systemPreferences.set(key, mergedValue, 'system');
						result.merged++;
					} catch (error) {
						result.errors.push({
							key,
							message: error instanceof Error ? error.message : 'Unknown error',
							code: 'MERGE_FAILED'
						});
						result.success = false;
					}
					continue;
				}
			}
			try {
				await db.systemPreferences.set(key, value, 'system');
				result.imported++;
			} catch (error) {
				result.errors.push({
					key,
					message: error instanceof Error ? error.message : 'Unknown error',
					code: 'IMPORT_FAILED'
				});
				result.success = false;
			}
		}
	}
	if (importData.collections) {
		for (const collection of importData.collections) {
			if (collection.documents && collection.documents.length > 0) {
				if (!dbAdapter) {
					logger.error('Database adapter not available for collection import');
					continue;
				}
				let importedCount = 0;
				let errorCount = 0;
				for (const doc of collection.documents) {
					try {
						const existing = await dbAdapter.crud.findOne(`collection_${collection.id}`, { _id: doc._id });
						if (existing.success && existing.data) {
							if (options.strategy === 'overwrite') {
								await dbAdapter.crud.update(`collection_${collection.id}`, doc._id, doc);
								importedCount++;
							} else if (options.strategy === 'merge') {
								const merged = { ...existing.data, ...doc };
								await dbAdapter.crud.update(`collection_${collection.id}`, doc._id, merged);
								importedCount++;
							}
						} else {
							await dbAdapter.crud.insert(`collection_${collection.id}`, doc);
							importedCount++;
						}
					} catch (e) {
						errorCount++;
						logger.error(`Failed to import document in ${collection.name}`, e);
					}
				}
				logger.info(`Imported ${importedCount} documents for ${collection.name} with ${errorCount} errors`);
				result.imported += importedCount;
			}
		}
	}
	if (result.success) {
		invalidateSettingsCache();
		const { loadSettingsFromDB } = await import('../../../../../chunks/db.js').then((n) => n.e);
		await loadSettingsFromDB();
		logger.info('Settings cache invalidated and reloaded after import');
	}
	logger.info('Import completed', {
		imported: result.imported,
		skipped: result.skipped,
		merged: result.merged,
		errors: result.errors.length
	});
	return result;
}
async function logImport(userId, metadata, result) {
	logger.info('Import audit log', {
		userId,
		import_id: metadata.export_id,
		imported_at: /* @__PURE__ */ new Date().toISOString(),
		success: result.success,
		imported: result.imported,
		skipped: result.skipped,
		merged: result.merged,
		errors: result.errors.length
	});
}
const POST = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	try {
		const body = await request.json();
		const importData = body.data;
		const options = body.options || {};
		const importOptions = {
			strategy: options.strategy || 'skip',
			dryRun: options.dryRun ?? false,
			validateOnly: options.validateOnly ?? false,
			sensitivePassword: options.sensitivePassword
		};
		if (importData.hasSensitiveData && importData.encryptedSensitive) {
			if (!importOptions.sensitivePassword) {
				return json(
					{
						success: false,
						error: 'Password required',
						message: 'This import contains encrypted sensitive data. Please provide the password.'
					},
					{ status: 400 }
				);
			}
			try {
				const decryptedSensitive = decryptSensitiveData(importData.encryptedSensitive, importOptions.sensitivePassword);
				importData.settings = {
					...importData.settings,
					...decryptedSensitive
				};
				logger.info(`Decrypted ${Object.keys(decryptedSensitive).length} sensitive settings`);
			} catch (decryptError) {
				return json(
					{
						success: false,
						error: 'Decryption failed',
						message: decryptError instanceof Error ? decryptError.message : 'Failed to decrypt sensitive data'
					},
					{ status: 400 }
				);
			}
		}
		const validation = await validateImportData(importData);
		if (!validation.valid) {
			return json(
				{
					success: false,
					errors: validation.errors,
					warnings: validation.warnings
				},
				{ status: 400 }
			);
		}
		if (importOptions.validateOnly) {
			return json({
				success: true,
				valid: true,
				errors: validation.errors,
				warnings: validation.warnings
			});
		}
		const conflicts = await detectConflicts(importData);
		if (importOptions.dryRun) {
			return json({
				success: true,
				dryRun: true,
				conflicts,
				validation
			});
		}
		const result = await applyImport(importData, importOptions, conflicts);
		await logImport(locals.user._id, importData.metadata, result);
		return json(
			{
				success: result.success,
				imported: result.imported,
				skipped: result.skipped,
				merged: result.merged,
				conflicts: result.conflicts,
				errors: result.errors,
				warnings: validation.warnings,
				metadata: importData.metadata
			},
			{ status: result.success ? 200 : 207 }
			// 207 Multi-Status if partial success
		);
	} catch (error) {
		logger.error('Import error:', error);
		return json(
			{
				success: false,
				error: 'Import failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
