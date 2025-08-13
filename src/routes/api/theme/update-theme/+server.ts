/**
 * @file src/routes/api/theme/update-theme/+server.ts
 * @description Server-side handler for updating the current theme for a tenant.
 *
 * @example POST /api/theme/update-theme
 *
 * Features:
 * - Updates the current theme based on the provided theme name in the request body.
 * - Checks if the user has permission to update the theme.
 * - Throws an error if the theme does not exist in the database for the current tenant.
 * - Throws an error if the theme update fails.
 * - Returns the updated theme in the response.
 */

import type { RequestHandler } from './$types';
import { ThemeManager } from '@src/databases/themeManager';
import { dbAdapter } from '@src/databases/db';
import type { Theme } from '@src/databases/dbInterface';
import { json, error } from '@sveltejs/kit';
import { privateEnv } from '@root/config/private';

// Permission checking

// System Logger
import { logger } from '@utils/logger.svelte';

// Initialize ThemeManager singleton
const themeManager = ThemeManager.getInstance();

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals;

	// Authentication is handled by hooks.server.ts
	if (!user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	if (privateEnv.MULTI_TENANT && !tenantId) {
		throw error(400, 'Tenant could not be identified for this operation.');
	} // Parse the request body

	const { themeName } = await request.json();

	if (!themeName || typeof themeName !== 'string') {
		logger.warn(`Invalid theme name provided: ${themeName}`, { tenantId });
		throw error(400, 'Invalid theme name.');
	}

	try {
		if (!dbAdapter) {
			throw new Error('Database adapter is not initialized');
		}

		// --- MULTI-TENANCY: Scope the query by tenantId ---
		const query: { name: string; tenantId?: string } = { name: themeName };
		if (privateEnv.MULTI_TENANT) {
			query.tenantId = tenantId;
		} // Fetch the theme from the database to ensure it exists for the current tenant

		const selectedTheme: Theme | null = await dbAdapter.findOne('themes', query);

		if (!selectedTheme) {
			logger.warn(`Theme '${themeName}' does not exist for this tenant.`, { tenantId });
			throw error(404, `Theme '${themeName}' does not exist.`);
		} // Set the selected theme as the default in the database for the current tenant

		await dbAdapter.setDefaultTheme(themeName, tenantId); // Update the theme in ThemeManager for the current tenant

		await themeManager.setTheme(selectedTheme, tenantId); // Fetch the updated default theme to confirm the change for the current tenant

		const updatedTheme: Theme = await themeManager.getTheme(tenantId);

		logger.info(`Theme successfully updated to '${updatedTheme.name}' by user '${user.id}'.`, { tenantId });

		return json({ success: true, theme: updatedTheme });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Error updating theme:', { error: errorMessage, tenantId });
		return json({ success: false, error: `Error updating theme: ${err.message}` }, { status: 500 });
	}
};
