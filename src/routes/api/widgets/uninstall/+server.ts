/**
 * @file src/routes/api/widgets/uninstall/+server.ts
 * @description API endpoint for uninstalling widgets
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '@utils/logger.server';
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';

export const POST: RequestHandler = async ({ request, locals }) => {
	const start = performance.now();
	try {
		const { user } = locals;

		if (!user) {
			return json(
				{
					success: false,
					message: 'Unauthorized',
					error: 'Authentication credentials missing'
				},
				{ status: 401 }
			);
		}

		// Check permission
		const hasWidgetPermission = hasPermissionWithRoles(user, 'api:widgets', locals.roles);
		if (!hasWidgetPermission) {
			logger.warn(`User ${user._id} denied access to widget uninstall API due to insufficient permissions`);
			return json(
				{
					success: false,
					message: 'Insufficient permissions',
					error: 'User lacks api:widgets permission'
				},
				{ status: 403 }
			);
		}
		const { widgetName, tenantId } = await request.json();

		if (!widgetName) {
			return json(
				{
					success: false,
					message: 'Validation Error',
					error: 'Widget name is required'
				},
				{ status: 400 }
			);
		}

		const actualTenantId = tenantId || locals.tenantId || 'default-tenant';

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
			data: {
				widgetName,
				tenantId: actualTenantId,
				uninstalledAt: new Date().toISOString()
			},
			message: 'Widget uninstalled successfully'
		};

		const duration = performance.now() - start;
		logger.info(`Widget ${widgetName} uninstalled successfully for tenant: ${actualTenantId}`, {
			tenantId: actualTenantId,
			duration: `${duration.toFixed(2)}ms`
		});

		return json(uninstallResult);
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to uninstall widget: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { duration: `${duration.toFixed(2)}ms` });

		return json(
			{
				success: false,
				message: 'Internal Server Error',
				error: message
			},
			{ status: 500 }
		);
	}
};
