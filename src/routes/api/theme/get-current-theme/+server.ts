/**
 * @file src/routes/api/theme/get-current-theme/+server.ts
 * @description Server-side handler for fetching the current theme for a tenant.
 */

import type { RequestHandler } from './$types';
import { ThemeManager } from '@src/databases/themeManager';
import { json } from '@sveltejs/kit';

// Permission checking

// System Logs
import { logger } from '@utils/logger.svelte';

// Get the singleton ThemeManager instance
const themeManager = ThemeManager.getInstance();

export const GET: RequestHandler = async ({ locals }) => {
	const { user, tenantId } = locals; // User is guaranteed to exist due to hooks protection

	try {
		// Check fine-grained permissions for theme access
		// Note: Basic API access (api:theme) is already verified by hooks
		const permissionResult = await checkApiPermission(user, {
			resource: 'system',
			action: 'read'
		});

		if (!permissionResult.hasPermission) {
			logger.warn(`Unauthorized attempt to fetch current theme`, {
				userId: user?._id,
				tenantId,
				error: permissionResult.error
			});
			return json(
				{
					error: permissionResult.error || 'Forbidden'
				},
				{ status: 403 } // Always 403 since user is authenticated by hooks
			);
		}

		// Note: tenantId validation is handled by hooks in multi-tenant mode
		const currentTheme = await themeManager.getTheme(tenantId);
		if (currentTheme) {
			logger.info('Current theme fetched successfully', { theme: currentTheme.name, tenantId });
			return json(currentTheme, { status: 200 });
		} else {
			logger.warn('No active theme found for tenant', { tenantId });
			return json({ error: 'No active theme found.' }, { status: 404 });
		}
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Error fetching current theme:', { error: errorMessage, tenantId });
		return json({ success: false, error: `Error fetching current theme: ${errorMessage}` }, { status: 500 });
	}
};
