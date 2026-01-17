import { json } from '@sveltejs/kit';
import { getAllSettings } from '../../../../../chunks/settingsService.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { e as encryptData } from '../../../../../chunks/crypto.js';
import { nanoid } from 'nanoid';
import { d as dbAdapter } from '../../../../../chunks/db.js';
import { c as collections } from '../../../../../chunks/collectionStore.svelte.js';
const SENSITIVE_PATTERNS = ['PASSWORD', 'SECRET', 'TOKEN', 'KEY', 'CLIENT_SECRET', 'PRIVATE_KEY', 'JWT_SECRET', 'ENCRYPTION_KEY', 'API_KEY'];
async function encryptSensitiveData(data, password) {
	return encryptData(data, password);
}
function isSensitiveField(key) {
	const upperKey = key.toUpperCase();
	return SENSITIVE_PATTERNS.some((pattern) => upperKey.includes(pattern));
}
async function exportSettings(options) {
	logger.info('Exporting settings', { options });
	const allSettings = await getAllSettings();
	const settings = {};
	const sensitive = {};
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
async function exportCollections(options) {
	logger.info('Exporting collections', { options });
	const availableCollections = collections.all;
	const exportedCollections = [];
	const targetCollections = options.collections
		? Object.values(availableCollections).filter((c) => c.name && options.collections?.includes(c.name))
		: Object.values(availableCollections);
	for (const collection of targetCollections) {
		const collectionExport = {
			id: collection._id || '',
			name: collection.name || '',
			label: collection.label || collection.name || '',
			fields: collection.fields,
			schema: collection,
			documents: []
		};
		if (dbAdapter) {
			try {
				const result = await dbAdapter.crud.findMany(`collection_${collection._id}`, {});
				if (result.success) {
					collectionExport.documents = result.data;
				}
			} catch (error) {
				logger.error(`Failed to export documents for collection ${collection.name}`, error);
			}
		}
		exportedCollections.push(collectionExport);
	}
	logger.info(`Exported ${exportedCollections.length} collections`);
	return exportedCollections;
}
function createExportMetadata(userId) {
	return {
		exported_at: /* @__PURE__ */ new Date().toISOString(),
		cms_version: process.env.npm_package_version || 'unknown',
		environment: process.env.NODE_ENV || 'development',
		exported_by: userId,
		export_id: nanoid()
	};
}
async function createExport(userId, options) {
	logger.info('Creating export', { userId, options });
	const exportData = {
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
		exportData.collections = await exportCollections(options);
	}
	logger.info('Export created successfully', {
		export_id: exportData.metadata.export_id,
		has_settings: !!exportData.settings,
		has_collections: !!exportData.collections,
		has_sensitive: exportData.hasSensitiveData
	});
	return exportData;
}
const POST = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	try {
		const options = await request.json();
		const exportOptions = {
			includeSettings: options.includeSettings ?? true,
			includeCollections: options.includeCollections ?? false,
			includeSensitive: options.includeSensitive ?? false,
			format: options.format ?? 'json',
			groups: options.groups,
			collections: options.collections
		};
		const exportData = await createExport(locals.user._id, exportOptions);
		const timestamp = /* @__PURE__ */ new Date().toISOString().replace(/[:.]/g, '-');
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
		logger.error('Export error:', error);
		return json(
			{
				error: 'Export failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
