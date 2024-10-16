/**
 * @file src/routes/api/theme/get-current-theme/+server.ts
 * @description Server-side handler for fetching the current theme.
 */

import type { RequestHandler } from './$types';
import { ThemeManager } from '@src/databases/themeManager';
import { dbAdapter } from '@src/databases/db';

// System Logs
import { logger } from '@src/utils/logger';

// Get the singleton ThemeManager instance
const themeManager = ThemeManager.getInstance(dbAdapter);

export const GET: RequestHandler = async () => {
	try {
		const currentTheme = themeManager.getTheme();
		if (currentTheme) {
			return new Response(JSON.stringify(currentTheme), { status: 200 });
		} else {
			return new Response(JSON.stringify({ error: 'No active theme found.' }), { status: 404 });
		}
	} catch (error: any) {
		logger.error('Error fetching current theme:', error.message);
		return new Response(JSON.stringify({ error: error.message }), { status: 500 });
	}
};
