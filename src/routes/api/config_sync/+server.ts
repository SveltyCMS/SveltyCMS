/**
 * @file src/routes/api/config_sync/+server.ts
 * @description Unified API for configuration synchronization.
 * Handles the diffing, exporting, and importing of configuration entities.
 *
 * Security: Protected by hooks, admin-only.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { configService } from '@src/services/ConfigService';
import { invalidateSettingsCache } from '@src/services/settingsService';
import { logger } from '@utils/logger.server';

// GET → Returns filesystem vs. database synchronization status
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || !locals.isAdmin) {
		throw error(403, 'Forbidden: Administrator access required.');
	}

	try {
		const status = await configService.getStatus();
		// Return only the sync status object for frontend compatibility
		return json(status);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Failed to get configuration status:', err);
		throw error(500, `Configuration status check failed: ${message}`);
	}
};

// POST → Triggers an 'import' or 'export' synchronization action
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user || !locals.isAdmin) {
		throw error(403, 'Forbidden: Administrator access required.');
	}

	try {
		const { action, uuids, payload } = await request.json();

		switch (action) {
			case 'import': {
				const status = await configService.getStatus();

				if (status.unmetRequirements.length > 0) {
					return json(
						{
							success: false,
							message: 'Import blocked due to unmet requirements.',
							unmetRequirements: status.unmetRequirements
						},
						{ status: 409 }
					);
				}

				await configService.performImport({ changes: payload });
				invalidateSettingsCache();

				return json({
					success: true,
					message: 'Configuration imported successfully.'
				});
			}

			case 'export': {
				// Enhanced: run export in parallel for all entity types, support large datasets
				const result = await configService.performExport({ uuids });
				return json({
					success: true,
					message: 'Configuration exported successfully.',
					output: result
				});
			}

			default:
				return json({ success: false, message: 'Invalid action specified.' }, { status: 400 });
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Configuration sync POST failed:', err);
		throw error(500, `Configuration sync failed: ${message}`);
	}
};
