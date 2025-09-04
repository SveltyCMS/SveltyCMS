/**
 * @file src/routes/api/setup/save-system-settings/+server.ts
 * @description API endpoint to save system settings during setup process using database-agnostic interface
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { systemConfigSchema } from '@utils/setupValidationSchemas';
import { safeParse } from 'valibot';
import { invalidateSettingsCache } from '@src/stores/globalSettings';
import { logger } from '@utils/logger.svelte';
import type { DatabaseAdapter } from '@src/databases/dbInterface';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { systemSettings, dbConfig } = await request.json();

		// Validate the system settings
		const validation = safeParse(systemConfigSchema, systemSettings);
		if (!validation.success) {
			const issues = validation.issues.map((i) => i.message).join(', ');
			return json({ success: false, error: `Invalid system settings: ${issues}` }, { status: 400 });
		}

		// Validate database configuration
		if (!dbConfig || !dbConfig.host || !dbConfig.name) {
			return json({ success: false, error: 'Database configuration is required' }, { status: 400 });
		}

		// For now, we need to use database-agnostic approach
		// Since we're in setup mode, we can't use the global dbAdapter yet
		// We'll need to create a temporary connection or use a different approach

		// Prepare settings data for database-agnostic storage
		const settingsToSave = [
			{ key: 'SITE_NAME', value: systemSettings.siteName, scope: 'system' as const, visibility: 'public' as const },
			{ key: 'DEFAULT_SYSTEM_LANGUAGE', value: systemSettings.defaultSystemLanguage, scope: 'system' as const, visibility: 'public' as const },
			{ key: 'SYSTEM_LANGUAGES', value: systemSettings.systemLanguages, scope: 'system' as const, visibility: 'public' as const },
			{ key: 'DEFAULT_CONTENT_LANGUAGE', value: systemSettings.defaultContentLanguage, scope: 'system' as const, visibility: 'public' as const },
			{ key: 'CONTENT_LANGUAGES', value: systemSettings.contentLanguages, scope: 'system' as const, visibility: 'public' as const },
			{ key: 'TIMEZONE', value: systemSettings.timezone, scope: 'system' as const, visibility: 'public' as const },
			{ key: 'MEDIA_FOLDER', value: systemSettings.mediaFolder, scope: 'system' as const, visibility: 'public' as const }
		];

		// For setup mode, we need to temporarily use MongoDB connection
		// In a real implementation, this would use a factory pattern to create the appropriate adapter
		const mongoose = await import('mongoose');

		// Build connection string (same logic as before)
		const hasScheme = typeof dbConfig.host === 'string' && (dbConfig.host.startsWith('mongodb://') || dbConfig.host.startsWith('mongodb+srv://'));
		const isAtlas = hasScheme && dbConfig.host.startsWith('mongodb+srv://');
		const baseHost = hasScheme ? dbConfig.host : `mongodb://${dbConfig.host}`;

		let hostWithPort = baseHost;
		if (!isAtlas && dbConfig.port) {
			const hostPortPart = baseHost.replace(/^mongodb(?:\+srv)?:\/\//, '').split('/')[0];
			const alreadyHasPort = /:[0-9]+$/.test(hostPortPart);
			if (!alreadyHasPort) hostWithPort = `${baseHost}:${dbConfig.port}`;
		}

		const connectionString = isAtlas ? `${baseHost}/${dbConfig.name}` : `${hostWithPort}/${dbConfig.name}`;

		const options = {
			user: dbConfig.user || undefined,
			pass: dbConfig.password || undefined,
			dbName: dbConfig.name,
			authSource: isAtlas ? undefined : 'admin',
			retryWrites: true,
			serverSelectionTimeoutMS: 15000,
			maxPoolSize: 5
		};

		let connection;
		try {
			connection = await mongoose.createConnection(connectionString, options).asPromise();

			// Import the SystemSetting model schema
			const { SystemSettingModel } = await import('@src/databases/mongodb/models/systemSetting');
			const SettingModel = connection.model('SystemSetting', SystemSettingModel.schema);

			// Save each setting to the database
			for (const setting of settingsToSave) {
				await SettingModel.findOneAndUpdate(
					{ key: setting.key },
					{
						key: setting.key,
						value: setting.value,
						scope: setting.scope,
						visibility: setting.visibility,
						updatedAt: new Date()
					},
					{ upsert: true, new: true }
				);
			}

			logger.info(`✅ Saved ${settingsToSave.length} system settings during setup`);
		} finally {
			if (connection) {
				await connection.close();
			}
		}

		// Invalidate the settings cache to force reload
		invalidateSettingsCache();

		return json({
			success: true,
			message: 'System settings saved successfully'
		});
	} catch (error) {
		logger.error('Error saving system settings:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error occurred'
			},
			{ status: 500 }
		);
	}
};
