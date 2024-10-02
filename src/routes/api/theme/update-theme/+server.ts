/**
 * @file src/routes/api/theme/update-theme/+server.ts
 * @description Server-side handler for updating the current theme.
 */

import type { RequestHandler } from './$types';
import { ThemeManager } from '@src/databases/themeManager';
import { dbAdapter } from '@src/databases/db';
import type { Theme } from '@src/databases/dbInterface';
import { authorizeAdmin } from '@src/auth';
import { json } from '@sveltejs/kit';

// System Logger
import { logger } from '@src/utils/logger';

// Initialize ThemeManager singleton
const themeManager = ThemeManager.getInstance();

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Authenticate and authorize the user
		const user = locals.user;
		if (!user || !(await authorizeAdmin(user))) {
			logger.warn(`Unauthorized attempt to update theme by user: ${user ? user.id : 'unknown'}`);
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		// Parse the request body
		const { themeName } = await request.json();

		if (!themeName || typeof themeName !== 'string') {
			logger.warn(`Invalid theme name provided: ${themeName}`);
			return json({ success: false, error: 'Invalid theme name.' }, { status: 400 });
		}

		// Fetch the theme from the database to ensure it exists
		const selectedTheme: Theme | null = await dbAdapter.findOne('themes', { name: themeName });

		if (!selectedTheme) {
			logger.warn(`Theme '${themeName}' does not exist.`);
			return json({ success: false, error: `Theme '${themeName}' does not exist.` }, { status: 404 });
		}

		// Set the selected theme as the default in the database
		await dbAdapter.setDefaultTheme(themeName);

		// Update the theme in ThemeManager
		await themeManager.setTheme(selectedTheme);

		// Fetch the updated default theme to confirm the change
		const updatedTheme: Theme = themeManager.getTheme();

		logger.info(`Theme successfully updated to '${updatedTheme.name}' by user '${user.id}'.`);

		return json({ success: true, theme: updatedTheme }, { status: 200 });
	} catch (error: any) {
		logger.error(`Error updating theme: ${error.message}`);
		return json({ success: false, error: 'Internal Server Error' }, { status: 500 });
	}
};
