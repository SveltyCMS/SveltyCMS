/**
 * @file src/routes/api/widgets/uninstall/+server.ts
 * @description API endpoint for uninstalling widgets
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '@utils/logger.svelte';
import { hasPermissionWithRoles } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user } = locals;

		if (!user) {
			throw error(401, 'Unauthorized');
		}

		// Check permission
		const hasWidgetPermission = hasPermissionWithRoles(user, 'api:widgets', roles);
		if (!hasWidgetPermission) {
			logger.warn(`User ${user._id} denied access to widget uninstall API due to insufficient permissions`);
			throw error(403, 'Insufficient permissions');
		}
		const { widgetName, tenantId } = await request.json();

		if (!widgetName) {
			throw error(400, 'Widget name is required');
		}

		const actualTenantId = tenantId || user.tenantId || 'default-tenant';

		// TODO: Implement widget uninstallation logic
		// 1. Check if widget is currently active (must be deactivated first)
		// 2. Check for dependencies (other widgets depending on this one)
		// 3. Remove widget files from tenant directory
		// 4. Update database to remove widget info
		// 5. Unregister widget from the system

		logger.info(`Uninstalling widget ${widgetName} for tenant: ${actualTenantId}`);

		// Mock uninstallation process
		const uninstallResult = {
			success: true,
			widgetName,
			tenantId: actualTenantId,
			uninstalledAt: new Date().toISOString(),
			message: 'Widget uninstalled successfully'
		};

		logger.debug(`Widget ${widgetName} uninstalled successfully for tenant: ${actualTenantId}`);

		return json(uninstallResult);
	} catch (err) {
		const message = `Failed to uninstall widget: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
