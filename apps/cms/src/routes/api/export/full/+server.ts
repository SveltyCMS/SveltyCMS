import { json, type RequestHandler } from '@sveltejs/kit';
import { getAllSettings } from '@src/services/settingsService';
import { logger } from '@utils/logger.svelte';
import { encryptData } from '@utils/crypto';
import { nanoid } from 'nanoid';
import type { ExportOptions, ExportData, ExportMetadata, CollectionExport } from '@content/types';

// Sensitive field patterns
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

/**
 * Encrypt data using AES-256-GCM with Argon2-derived key
 * Uses enterprise-grade cryptography from shared utils
 */
async function encryptSensitiveData(data: Record<string, unknown>, password: string): Promise<string> {
	return encryptData(data, password);
}

/**
 * Check if a field key is sensitive
 */
function isSensitiveField(key: string): boolean {
	const upperKey = key.toUpperCase();
	return SENSITIVE_PATTERNS.some((pattern) => upperKey.includes(pattern));
}

/**
 * Export all settings, separating sensitive data
 */
async function exportSettings(options: ExportOptions): Promise<{ settings: Record<string, unknown>; sensitive: Record<string, unknown> }> {
	logger.info('Exporting settings', { options });

	const allSettings = await getAllSettings();
	const settings: Record<string, unknown> = {};
	const sensitive: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(allSettings)) {
		if (isSensitiveField(key)) {
			if (options.includeSensitive) {
				// Separate sensitive data for encryption
				sensitive[key] = value;
				logger.trace(`Collected sensitive field for encryption: ${key}`);
			} else {
				logger.trace(`Skipping sensitive field: ${key}`);
			}
		} else {
			// Non-sensitive data goes directly to settings
			settings[key] = value;
		}
	}

	logger.info(`Exported ${Object.keys(settings).length} regular settings, ${Object.keys(sensitive).length} sensitive settings`);
	return { settings, sensitive };
}

/**
 * Export all collection schemas
 */
async function exportCollections(): Promise<CollectionExport[]> {
	logger.info('Exporting collections');

	// Get all collections (implementation depends on your schema)
	// This is a placeholder - adjust based on your actual collection structure
	const collections: CollectionExport[] = [];

	// TODO: Implement actual collection export
	// For now, return empty array
	logger.info(`Exported ${collections.length} collections`);
	return collections;
}

/**
 * Create export metadata
 */
function createExportMetadata(userId: string): ExportMetadata {
	return {
		exported_at: new Date().toISOString(),
		cms_version: process.env.npm_package_version || 'unknown',
		environment: process.env.NODE_ENV || 'development',
		exported_by: userId,
		export_id: nanoid()
	};
}

/**
 * Create complete export data
 */
async function createExport(userId: string, options: ExportOptions): Promise<ExportData> {
	logger.info('Creating export', { userId, options });

	const exportData: ExportData = {
		metadata: createExportMetadata(userId),
		hasSensitiveData: false
	};

	if (options.includeSettings) {
		const { settings, sensitive } = await exportSettings(options);
		exportData.settings = settings;

		// Handle sensitive data encryption
		if (options.includeSensitive && Object.keys(sensitive).length > 0) {
			if (!options.sensitivePassword) {
				throw new Error('sensitivePassword is required when includeSensitive is true');
			}

			// Encrypt sensitive data with password using Argon2-derived key
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

/**
 * Export full system configuration
 * POST /api/export/full
 *
 * Exports settings and optionally collections with metadata.
 * Supports filtering by groups/collections and sensitive data inclusion.
 *
 * Permissions: config:settings:read (or admin)
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	// Check authentication
	// Authentication already handled by hooks.server.ts (API_PERMISSIONS)
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Parse export options from request body
		const options: ExportOptions = await request.json();

		// Default options if not provided
		const exportOptions: ExportOptions = {
			includeSettings: options.includeSettings ?? true,
			includeCollections: options.includeCollections ?? false,
			includeSensitive: options.includeSensitive ?? false,
			format: options.format ?? 'json',
			groups: options.groups,
			collections: options.collections
		};

		// Create export
		const exportData = await createExport(locals.user.id, exportOptions);

		// Determine filename
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const environment = exportData.metadata.environment || 'unknown';
		const filename = `sveltycms-export-${environment}-${timestamp}.json`;

		// Return export data
		return json(exportData, {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	} catch (error) {
		console.error('Export error:', error);
		return json(
			{
				error: 'Export failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
