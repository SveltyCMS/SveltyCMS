/**
 * @file src/routes/api/export/+server.ts
 * @description General export endpoint supporting multiple export types
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { dbAdapter } from '@src/databases/db';
import { getAllSettings } from '@src/services/settingsService';
import { logger } from '@utils/logger.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user } = locals;

		// Require authentication
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const { type, download = false } = body;

		if (!type) {
			return json({ error: 'Export type is required' }, { status: 400 });
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
					return json({ error: 'Failed to export users' }, { status: 500 });
				}
				break;

			case 'settings':
				// Export settings
				const settings = await getAllSettings();
				exportData = {
					type: 'settings',
					exportedAt: new Date().toISOString(),
					data: settings
				};
				break;

			case 'all':
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

			default:
				return json({ error: 'Invalid export type' }, { status: 400 });
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
	} catch (error: any) {
		logger.error('Export error', { error: error.message });
		return json({ error: 'Failed to export data' }, { status: 500 });
	}
};
