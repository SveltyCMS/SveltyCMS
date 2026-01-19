/**
 * @file src/routes/api/plugins/toggle/+server.ts
 * @description API endpoint for toggling plugin enabled/disabled state
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pluginRegistry } from '@cms/plugins';
import { logger } from '@shared/utils/logger.server';
import { getErrorMessage } from '@shared/utils/errorHandling';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals;

	// 1. Authorization Check (Admin only)
	if (!user || user.role !== 'admin') {
		// Use 'admin' string directly if Role enum not easily available, or check locals.isAdmin
		// locals.isAdmin is set in handleAuthorization
		if (!locals.isAdmin) {
			return json({ success: false, message: 'Unauthorized' }, { status: 403 });
		}
	}

	try {
		const { pluginId, enabled } = await request.json();

		if (!pluginId || typeof enabled !== 'boolean') {
			return json({ success: false, message: 'Invalid request body' }, { status: 400 });
		}

		logger.info(`Toggling plugin ${pluginId} to ${enabled} for tenant ${tenantId || 'global'}`);

		// 2. Toggle Plugin State
		const success = await pluginRegistry.togglePlugin(pluginId, enabled, tenantId || 'default', user._id);

		if (success) {
			// Optional: Invalidate caches if needed?
			return json({ success: true, message: `Plugin ${enabled ? 'enabled' : 'disabled'} successfully` });
		} else {
			return json({ success: false, message: 'Failed to update plugin state' }, { status: 500 });
		}
	} catch (error) {
		logger.error('Error toggling plugin state:', error);
		return json(
			{
				success: false,
				message: `Error toggling plugin: ${getErrorMessage(error)}`
			},
			{ status: 500 }
		);
	}
};
