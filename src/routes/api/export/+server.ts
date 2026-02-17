/**
 * @file src/routes/api/export/+server.ts
 * @description General export endpoint supporting multiple export types
 */

import { dbAdapter } from '@src/databases/db';
import { getAllSettings } from '@src/services/settingsService';
import { json } from '@sveltejs/kit';
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';
import { logger } from '@utils/logger.server';

export const POST = apiHandler(async ({ request, locals }) => {
	const { user } = locals;

	// Require authentication
	if (!user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	if (!dbAdapter) {
		throw new AppError('Database adapter not initialized', 500, 'DB_ADAPTER_MISSING');
	}

	const body = await request.json();
	const { type, download = false } = body;

	if (!type) {
		throw new AppError('Export type is required', 400, 'MISSING_EXPORT_TYPE');
	}

	let exportData: any = {};

	switch (type) {
		case 'collections':
			// Export all collections (basic implementation)
			exportData = {
				type: 'collections',
				exportedAt: new Date().toISOString(),
				data: []
			};
			break;

		case 'users':
			// Export users
			try {
				const users = await dbAdapter.auth.getAllUsers();
				exportData = {
					type: 'users',
					exportedAt: new Date().toISOString(),
					data: users
				};
			} catch (error) {
				logger.error('Failed to export users', error);
				throw new AppError('Failed to export users', 500, 'USER_EXPORT_FAILED');
			}
			break;

		case 'settings': {
			// Export settings
			const settings = await getAllSettings();
			exportData = {
				type: 'settings',
				exportedAt: new Date().toISOString(),
				data: settings
			};
			break;
		}

		case 'all': {
			// Export everything
			const allSettings = await getAllSettings();
			const allUsers = await dbAdapter.auth.getAllUsers();

			exportData = {
				type: 'all',
				exportedAt: new Date().toISOString(),
				settings: allSettings,
				users: allUsers,
				collections: []
			};
			break;
		}

		default:
			throw new AppError('Invalid export type', 400, 'INVALID_EXPORT_TYPE');
	}

	logger.info(`Exported data of type: ${type}`);

	// If download is requested, could set content-disposition header
	if (download) {
		return new Response(JSON.stringify(exportData, null, 2), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="sveltycms-export-${type}-${Date.now()}.json"`
			}
		});
	}

	return json(exportData);
});
