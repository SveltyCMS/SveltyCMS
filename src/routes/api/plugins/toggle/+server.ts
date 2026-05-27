/**
 * @file src/routes/api/plugins/toggle/+server.ts
 * @description API endpoint for toggling plugin enabled/disabled state.
 *
 * Features:
 * - Authorization Check (Admin only)
 * - Toggle Plugin State
 * - Error Handling
 *
 */

// type RequestHandler removed
import { pluginRegistry } from '@src/plugins';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

export const POST = apiHandler(async ({ request, locals }) => {
	const { user, tenantId } = locals;

	// 1. Authorization Check (Admin only)
	if (!user || user.role !== 'admin') {
		throw new AppError('Unauthorized', 403, 'FORBIDDEN');
	}

	try {
		const { pluginId, enabled } = await request.json();

		if (!pluginId || typeof enabled !== 'boolean') {
			throw new AppError('Invalid request body', 400, 'INVALID_BODY');
		}

		logger.info(`🔌 Toggling plugin ${pluginId} to ${enabled} for tenant ${tenantId || 'global'}`);

		// 2. Toggle Plugin State
		const success = await pluginRegistry.togglePlugin(pluginId, enabled, tenantId || 'default', user._id as string);

		if (success) {
			return json({
				success: true,
				message: `Plugin ${enabled ? 'enabled' : 'disabled'} successfully`
			});
		}
		throw new AppError('Failed to update plugin state', 500, 'UPDATE_FAILED');
	} catch (error: any) {
		if (error instanceof AppError) {
			throw error;
		}
		logger.error('Error toggling plugin state:', error);
		throw new AppError(`Error toggling plugin: ${error.message || 'Unknown error'}`, 500, 'TOGGLE_ERROR');
	}
});
