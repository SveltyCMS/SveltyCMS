/**
 * @file src/routes/api/theme/get-current-theme/+server.ts
 * @description Server-side handler for fetching the current theme.
 */

import type { RequestHandler } from './$types';
import { ThemeManager } from '@src/databases/themeManager';

// System Logs
import { logger } from '@utils/logger';

// Get the singleton ThemeManager instance
const themeManager = ThemeManager.getInstance();

export const GET: RequestHandler = async ({ locals }) => {
	try {
		// Check if the user has permission to access this API
		if (!locals.user || !locals.hasManageUsersPermission) {
			logger.warn(`Unauthorized attempt to fetch current theme by user: ${locals.user ? locals.user.id : 'unknown'}`);
			return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
		}

		const currentTheme = themeManager.getTheme();
		if (currentTheme) {
			return new Response(JSON.stringify(currentTheme), { status: 200 });
		} else {
			return new Response(JSON.stringify({ error: 'No active theme found.' }), { status: 404 });
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error fetching current theme:', { error: errorMessage });
		return json({ success: false, error: `Error fetching current theme: ${error.message}` }, { status: 500 });
	}
};
