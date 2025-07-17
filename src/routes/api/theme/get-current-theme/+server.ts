/**
 * @file src/routes/api/theme/get-current-theme/+server.ts
 * @description Server-side handler for fetching the current theme.
 */

import type { RequestHandler } from './$types';
import { ThemeManager } from '@src/databases/themeManager';
import { json } from '@sveltejs/kit';

// Permission checking
import { checkApiPermission } from '@api/permissions';

// System Logs
import { logger } from '@utils/logger.svelte';

// Get the singleton ThemeManager instance
const themeManager = ThemeManager.getInstance();

export const GET: RequestHandler = async ({ locals }) => {
	try {
		// Check permissions for theme access
		const permissionResult = await checkApiPermission(locals.user, {
			resource: 'system',
			action: 'read'
		});

		if (!permissionResult.hasPermission) {
			logger.warn(`Unauthorized attempt to fetch current theme`, {
				userId: locals.user?._id,
				error: permissionResult.error
			});
			return json(
				{
					error: permissionResult.error || 'Forbidden'
				},
				{ status: permissionResult.error?.includes('Authentication') ? 401 : 403 }
			);
		}

		const currentTheme = themeManager.getTheme();
		if (currentTheme) {
			return json(currentTheme, { status: 200 });
		} else {
			return json({ error: 'No active theme found.' }, { status: 404 });
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error fetching current theme:', { error: errorMessage });
		return json({ success: false, error: `Error fetching current theme: ${errorMessage}` }, { status: 500 });
	}
};
