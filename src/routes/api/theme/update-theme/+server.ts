/**
 * @file src/routes/api/theme/update-theme/+server.ts
 * @description Server-side handler for updating the current theme.
 */

import type { RequestHandler } from './$types';
import { ThemeManager } from '@src/databases/themeManager';
import { dbAdapter } from '@src/databases/db';
import type { Theme } from '@src/databases/dbInterface';
import { json, error } from '@sveltejs/kit';

// System Logger
import { logger } from '@src/utils/logger';

// Initialize ThemeManager singleton
const themeManager = ThemeManager.getInstance();

export const POST: RequestHandler = async ({ request, locals }) => {
	// Authenticate and authorize the user
	const user = locals.user;
	if (!user || !(await authorizeAdmin(user))) {
		logger.warn(`Unauthorized attempt to update theme by user: ${user ? user.id : 'unknown'}`);
		throw error(401, 'Unauthorized');
	}

	// Parse the request body
	const { themeName } = await request.json();

	if (!themeName || typeof themeName !== 'string') {
		logger.warn(`Invalid theme name provided: ${themeName}`);
		throw error(400, 'Invalid theme name.');
	}

	try {
		// Fetch the theme from the database to ensure it exists
		const selectedTheme: Theme | null = await dbAdapter.findOne('themes', { name: themeName });

		if (!selectedTheme) {
			logger.warn(`Theme '${themeName}' does not exist.`);
			throw error(404, `Theme '${themeName}' does not exist.`);
		}

		// Set the selected theme as the default in the database
		await dbAdapter.setDefaultTheme(themeName);

		// Update the theme in ThemeManager
		await themeManager.setTheme(selectedTheme);

		// Fetch the updated default theme to confirm the change
		const updatedTheme: Theme = themeManager.getTheme();

		logger.info(`Theme successfully updated to '${updatedTheme.name}' by user '${user.id}'.`);

		return json({ success: true, theme: updatedTheme });
	} catch (err) {
		const message = `Error updating theme: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
