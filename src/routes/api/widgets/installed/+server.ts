/**
 * @file src/routes/api/widgets/installed/+server.ts
 * @description API endpoint for managing installed widgets per tenant
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '@utils/logger.svelte';
import { hasPermissionWithRoles } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const { user } = locals;

		if (!user) {
			throw error(401, 'Unauthorized');
		}

		// Check permission
		const hasWidgetPermission = hasPermissionWithRoles(user, 'api:widgets', roles);
		if (!hasWidgetPermission) {
			logger.warn(`User ${user._id} denied access to widget API due to insufficient permissions`);
			throw error(403, 'Insufficient permissions');
		}
		const tenantId = url.searchParams.get('tenantId') || user.tenantId || 'default-tenant';

		// TODO: Implement database query to get installed widgets for tenant
		// For now, return mock data
		const installedWidgets = [
			// Mock installed widgets - replace with actual database query
			'colorPicker',
			'currency',
			'rating'
		];

		logger.debug(`Retrieved ${installedWidgets.length} installed widgets for tenant: ${tenantId}`);

		return json(installedWidgets);
	} catch (err) {
		const message = `Failed to get installed widgets: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
