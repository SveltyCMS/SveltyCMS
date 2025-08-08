/**
 * @file src/routes/api/widgets/status/+server.ts
 * @description API endpoint for updating widget status
 */
import { json, error } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import type { RequestHandler } from './$types';
import { hasPermissionWithRoles } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const { user } = locals;

		// Check authentication
		if (!user) {
			throw error(401, 'Unauthorized');
		}

		// Check permission
		const hasWidgetPermission = hasPermissionWithRoles(user, 'api:widgets', roles);
		if (!hasWidgetPermission) {
			logger.warn(
				`User ${user._id} (role: ${user.role}, tenant: ${user.tenantId || 'global'}) denied access to API /api/widgets due to insufficient role permissions`
			);
			throw error(403, 'Insufficient permissions');
		}

		const tenantId = request.headers.get('X-Tenant-ID') || locals.tenantId;
		const { widgetName, isActive } = await request.json();

		if (!widgetName || typeof isActive !== 'boolean') {
			throw error(400, 'Missing or invalid widgetName or isActive');
		}

		if (!locals.dbAdapter?.widgets) {
			logger.error('Widget database adapter not available');
			throw error(500, 'Widget database adapter not available');
		}

		// Update widget status in database
		if (isActive) {
			await locals.dbAdapter.widgets.activateWidget(widgetName);
		} else {
			await locals.dbAdapter.widgets.deactivateWidget(widgetName);
		}

		logger.info(`Widget ${widgetName} ${isActive ? 'activated' : 'deactivated'}`, { tenantId });

		return json({
			success: true,
			widgetName,
			isActive,
			tenantId
		});
	} catch (err) {
		const message = `Failed to update widget status: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);

		if (err instanceof Response) {
			throw err;
		}

		throw error(500, message);
	}
};
