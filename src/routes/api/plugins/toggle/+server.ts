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

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pluginRegistry } from '@src/plugins';
import { logger } from '@utils/logger.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals;

	// 1. Authorization Check (Admin only)
	if (!user || user.role !== 'admin') {
		return json({ success: false, message: 'Unauthorized' }, { status: 403 });
	}

	try {
		const { pluginId, enabled } = await request.json();

		if (!pluginId || typeof enabled !== 'boolean') {
			return json({ success: false, message: 'Invalid request body' }, { status: 400 });
		}

		logger.info(`🔌 Toggling plugin ${pluginId} to ${enabled} for tenant ${tenantId || 'global'}`);

		// 2. Toggle Plugin State
		const success = await pluginRegistry.togglePlugin(pluginId, enabled, tenantId || 'default', user._id as string);

		if (success) {
			return json({ success: true, message: `Plugin ${enabled ? 'enabled' : 'disabled'} successfully` });
		} else {
			return json({ success: false, message: 'Failed to update plugin state' }, { status: 500 });
		}
	} catch (error: any) {
		logger.error('Error toggling plugin state:', error);
		return json(
			{
				success: false,
				message: `Error toggling plugin: ${error.message || 'Unknown error'}`
			},
			{ status: 500 }
		);
	}
};
