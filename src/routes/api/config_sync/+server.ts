/**
 * @file src/routes/api/config_sync/+server.ts
 * @description Unified API for configuration synchronization.
 * Handles the diffing, exporting, and importing of configuration entities.
 *
 * Security: Protected by hooks, admin-only.
 */

import { configService } from '@src/services/ConfigService';
import { invalidateSettingsCache } from '@src/services/settingsService';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';
import { logger } from '@utils/logger.server';

// GET → Returns filesystem vs. database synchronization status
export const GET = apiHandler(async ({ locals }) => {
	if (!(locals.user && locals.isAdmin)) {
		throw new AppError('Forbidden: Administrator access required.', 403, 'FORBIDDEN');
	}

	try {
		const status = await configService.getStatus();
		// Return only the sync status object for frontend compatibility
		return json(status);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Failed to get configuration status:', err);
		throw new AppError(`Configuration status check failed: ${message}`, 500, 'CONFIG_STATUS_ERROR');
	}
});

// POST → Triggers an 'import' or 'export' synchronization action
export const POST = apiHandler(async ({ locals, request }) => {
	if (!(locals.user && locals.isAdmin)) {
		throw new AppError('Forbidden: Administrator access required.', 403, 'FORBIDDEN');
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
				throw new AppError('Invalid action specified.', 400, 'INVALID_ACTION');
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error('Configuration sync POST failed:', err);
		if (err instanceof AppError) {
			throw err;
		}
		throw new AppError(`Configuration sync failed: ${message}`, 500, 'CONFIG_SYNC_ERROR');
	}
});
