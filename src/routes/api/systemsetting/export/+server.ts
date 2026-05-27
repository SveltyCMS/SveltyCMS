/**
 * @file src/routes/api/systemsetting/export/+server.ts
 * @description Handles system settings export requests.
 */

import type { CollectionExport, ExportData, ExportMetadata, ExportOptions } from '@content/types';
import { getAllSettings } from '@src/services/settings-service';
import { json } from '@sveltejs/kit';
import { encryptData } from '@utils/crypto';
import { logger } from '@utils/logger.server';
import { nanoid } from 'nanoid';

const SENSITIVE_PATTERNS: string[] = [
	'PASSWORD',
	'SECRET',
	'TOKEN',
	'KEY',
	'CLIENT_SECRET',
	'PRIVATE_KEY',
	'JWT_SECRET',
	'ENCRYPTION_KEY',
	'API_KEY'
];

async function encryptSensitiveData(data: Record<string, unknown>, password: string): Promise<string> {
	return encryptData(data, password);
}

function isSensitiveField(key: string): boolean {
	const upperKey = key.toUpperCase();
	return SENSITIVE_PATTERNS.some((pattern) => upperKey.includes(pattern));
}

async function exportSettings(options: ExportOptions): Promise<{
	settings: Record<string, unknown>;
	sensitive: Record<string, unknown>;
}> {
	logger.info('Exporting settings', { options });
	const allSettings = await getAllSettings();
	const settings: Record<string, unknown> = {};
	const sensitive: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(allSettings)) {
		if (isSensitiveField(key)) {
			if (options.includeSensitive) {
				sensitive[key] = value;
				logger.trace(`Collected sensitive field for encryption: ${key}`);
			} else {
				logger.trace(`Skipping sensitive field: ${key}`);
			}
		} else {
			settings[key] = value;
		}
	}
	logger.info(`Exported ${Object.keys(settings).length} regular settings, ${Object.keys(sensitive).length} sensitive settings`);
	return { settings, sensitive };
}

async function exportCollections(): Promise<CollectionExport[]> {
	logger.info('Exporting collections');
	const collections: CollectionExport[] = [];
	logger.info(`Exported ${collections.length} collections`);
	return collections;
}

function createExportMetadata(userId: string): ExportMetadata {
	return {
		exported_at: new Date().toISOString(),
		cms_version: process.env.npm_package_version || 'unknown',
		environment: process.env.NODE_ENV || 'development',
		exported_by: userId,
		export_id: nanoid()
	};
}

async function createExport(userId: string, options: ExportOptions): Promise<ExportData> {
	logger.info('Creating export', { userId, options });
	const exportData: ExportData = {
		metadata: createExportMetadata(userId),
		hasSensitiveData: false
	};
	if (options.includeSettings) {
		const { settings, sensitive } = await exportSettings(options);
		exportData.settings = settings;
		if (options.includeSensitive && Object.keys(sensitive).length > 0) {
			if (!options.sensitivePassword) {
				throw new Error('sensitivePassword is required when includeSensitive is true');
			}
			exportData.encryptedSensitive = await encryptSensitiveData(sensitive, options.sensitivePassword);
			exportData.hasSensitiveData = true;
			logger.info(`Encrypted ${Object.keys(sensitive).length} sensitive settings`);
		}
	}
	if (options.includeCollections) {
		exportData.collections = await exportCollections();
	}
	logger.info('Export created successfully', {
		export_id: exportData.metadata.export_id,
		has_settings: !!exportData.settings,
		has_collections: !!exportData.collections,
		has_sensitive: exportData.hasSensitiveData
	});
	return exportData;
}

// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';

export const POST = apiHandler(async ({ locals, request }) => {
	if (!locals.user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}
	try {
		const options: ExportOptions = await request.json();
		const exportOptions: ExportOptions = {
			includeSettings: options.includeSettings ?? true,
			includeCollections: options.includeCollections ?? false,
			includeSensitive: options.includeSensitive ?? false,
			format: options.format ?? 'json',
			groups: options.groups,
			collections: options.collections
		};
		const exportData = await createExport(locals.user._id, exportOptions);
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const environment = exportData.metadata.environment || 'unknown';
		const filename = `sveltycms-export-${environment}-${timestamp}.json`;
		return json(exportData, {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}
		logger.error(`Export error: ${error instanceof Error ? error.message : String(error)}`);
		if (error instanceof Error) {
			logger.error(error.stack || 'No stack trace');
		}
		throw new AppError(error instanceof Error ? error.message : 'Unknown error', 500, 'EXPORT_FAILED');
	}
});
