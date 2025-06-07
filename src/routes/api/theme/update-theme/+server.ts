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
import { logger } from '@utils/logger.svelte';

// Initialize ThemeManager singleton
const themeManager = ThemeManager.getInstance();

export const POST: RequestHandler = async ({ request, locals }) => {
	// Authenticate and authorize the user
	if (!locals.user || !locals.hasManageUsersPermission) {
		logger.warn(`Unauthorized attempt to update theme by user: ${locals.user ? locals.user.id : 'unknown'}`);
		throw error(401, 'Unauthorized');
	}

	// Parse the request body
	const { themeName } = await request.json();

	if (!themeName || typeof themeName !== 'string') {
		logger.warn(`Invalid theme name provided: ${themeName}`);
		throw error(400, 'Invalid theme name.');
	}

	try {
		if (!dbAdapter) {
			throw new Error('Database adapter is not initialized');
		}

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

		logger.info(`Theme successfully updated to '${updatedTheme.name}' by user '${locals.user.id}'.`);

		return json({ success: true, theme: updatedTheme });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error updating theme:', { error: errorMessage });
		return json({ success: false, error: `Error updating theme: ${error.message}` }, { status: 500 });
	}
};
