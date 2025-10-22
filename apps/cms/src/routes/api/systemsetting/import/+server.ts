import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb } from '@src/databases/db';
import { getAllSettings, invalidateSettingsCache } from '@src/services/settingsService';
import { logger } from '@utils/logger.svelte';
import { decryptData } from '@utils/crypto';
import type {
	ExportData,
	ImportOptions,
	ValidationResult,
	ValidationError,
	ValidationWarning,
	Conflict,
	ImportResult,
	ExportMetadata
} from '@content/types';

async function decryptSensitiveData(encryptedData: string, password: string): Promise<Record<string, unknown>> {
	try {
		return await decryptData(encryptedData, password);
	} catch {
		throw new Error('Failed to decrypt sensitive data. Password may be incorrect.');
	}
}

async function validateImportData(data: ExportData): Promise<ValidationResult> {
	const errors: ValidationError[] = [];
	const warnings: ValidationWarning[] = [];
	if (!data.metadata) {
		errors.push({ path: 'metadata', message: 'Missing required metadata', code: 'MISSING_METADATA' });
	} else {
		if (!data.metadata.exported_at) {
			errors.push({ path: 'metadata.exported_at', message: 'Missing export timestamp', code: 'MISSING_TIMESTAMP' });
		}
		if (!data.metadata.cms_version) {
			warnings.push({ path: 'metadata.cms_version', message: 'Missing CMS version - compatibility cannot be verified', code: 'MISSING_VERSION' });
		}
	}
	if (data.settings) {
		if (typeof data.settings !== 'object') {
			errors.push({ path: 'settings', message: 'Settings must be an object', code: 'INVALID_SETTINGS_TYPE' });
		} else {
			for (const [key, value] of Object.entries(data.settings)) {
				if (key === '' || key === null || key === undefined) {
					errors.push({ path: `settings.${key}`, message: 'Invalid setting key', code: 'INVALID_SETTING_KEY' });
				}
				if (value === null || value === undefined) {
					warnings.push({ path: `settings.${key}`, message: 'Setting has null or undefined value', code: 'NULL_SETTING_VALUE' });
				}
			}
		}
	}
	if (data.collections) {
		if (!Array.isArray(data.collections)) {
			errors.push({ path: 'collections', message: 'Collections must be an array', code: 'INVALID_COLLECTIONS_TYPE' });
		} else {
			data.collections.forEach((collection, index) => {
				if (!collection.id) {
					errors.push({ path: `collections[${index}].id`, message: 'Collection missing required id', code: 'MISSING_COLLECTION_ID' });
				}
				if (!collection.name) {
					errors.push({ path: `collections[${index}].name`, message: 'Collection missing required name', code: 'MISSING_COLLECTION_NAME' });
				}
			});
		}
	}
	if (!data.settings && !data.collections) {
		warnings.push({ path: 'root', message: 'Export contains no settings or collections', code: 'EMPTY_EXPORT' });
	}
	return { valid: errors.length === 0, errors, warnings };
}

async function detectConflicts(importData: ExportData): Promise<Conflict[]> {
	const conflicts: Conflict[] = [];
	if (importData.settings) {
		const currentSettings = await getAllSettings();
		for (const [key, importValue] of Object.entries(importData.settings)) {
			const currentValue = (currentSettings as Record<string, unknown>)[key];
			if (currentValue !== undefined) {
				if (JSON.stringify(currentValue) !== JSON.stringify(importValue)) {
					conflicts.push({ type: 'setting', key, current: currentValue, import: importValue, recommendation: 'overwrite' });
				}
			}
		}
	}
	return conflicts;
}

function mergeValues(current: unknown, imported: unknown): unknown {
	if (typeof current === 'object' && typeof imported === 'object' && current !== null && imported !== null) {
		if (Array.isArray(current) && Array.isArray(imported)) {
			return [...new Set([...current, ...imported])];
		}
		return { ...current, ...imported };
	}
	return imported;
}

async function applyImport(importData: ExportData, options: ImportOptions, conflicts: Conflict[]): Promise<ImportResult> {
	const result: ImportResult = { success: true, imported: 0, skipped: 0, merged: 0, errors: [], conflicts };
	const db = getDb();
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
						result.errors.push({ key, message: error instanceof Error ? error.message : 'Unknown error', code: 'MERGE_FAILED' });
						result.success = false;
					}
					continue;
				}
			}
			try {
				await db.systemPreferences.set(key, value, 'system');
				result.imported++;
			} catch (error) {
				result.errors.push({ key, message: error instanceof Error ? error.message : 'Unknown error', code: 'IMPORT_FAILED' });
				result.success = false;
			}
		}
	}
	if (result.success) {
		invalidateSettingsCache();
		const { loadSettingsFromDB } = await import('@src/databases/db');
		await loadSettingsFromDB();
		logger.info('Settings cache invalidated and reloaded after import');
	}
	logger.info('Import completed', { imported: result.imported, skipped: result.skipped, merged: result.merged, errors: result.errors.length });
	return result;
}

async function logImport(userId: string, metadata: ExportMetadata, result: ImportResult): Promise<void> {
	logger.info('Import audit log', {
		userId,
		import_id: metadata.export_id,
		imported_at: new Date().toISOString(),
		success: result.success,
		imported: result.imported,
		skipped: result.skipped,
		merged: result.merged,
		errors: result.errors.length
	});
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	try {
		const body = await request.json();
		const importData: ExportData = body.data;
		const options: ImportOptions = body.options || {};
		const importOptions: ImportOptions = {
			strategy: options.strategy || 'skip',
			dryRun: options.dryRun ?? false,
			validateOnly: options.validateOnly ?? false,
			sensitivePassword: options.sensitivePassword
		};
		if (importData.hasSensitiveData && importData.encryptedSensitive) {
			if (!importOptions.sensitivePassword) {
				return json(
					{ success: false, error: 'Password required', message: 'This import contains encrypted sensitive data. Please provide the password.' },
					{ status: 400 }
				);
			}
			try {
				const decryptedSensitive = await decryptSensitiveData(importData.encryptedSensitive, importOptions.sensitivePassword);
				importData.settings = { ...importData.settings, ...decryptedSensitive };
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
			return json({ success: false, errors: validation.errors, warnings: validation.warnings }, { status: 400 });
		}
		if (importOptions.validateOnly) {
			return json({ success: true, valid: true, errors: validation.errors, warnings: validation.warnings });
		}
		const conflicts = await detectConflicts(importData);
		if (importOptions.dryRun) {
			return json({ success: true, dryRun: true, conflicts, validation });
		}
		const result: ImportResult = await applyImport(importData, importOptions, conflicts);
		await logImport(locals.user.id, importData.metadata, result);
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
		);
	} catch (error) {
		console.error('Import error:', error);
		return json({ success: false, error: 'Import failed', message: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
	}
};
