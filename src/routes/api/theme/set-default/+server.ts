/**
 * @file src/routes/api/theme/set-default/+server.ts
 * @description Server-side handler for setting the default theme for a tenant.
 *
 * @example POST /api/theme/set-default
 *
 * Features:
 * - Sets the provided theme as the default for the current tenant.
 * - Checks if the user has permission to update the theme.
 * - Throws an error if the theme update fails.
 * - Returns the updated theme in the response.
 */

import type { RequestHandler } from './$types';
import { ThemeManager } from '@src/databases/themeManager';
import { dbAdapter } from '@src/databases/db';
import type { Theme, DatabaseId } from '@src/databases/dbInterface';
import { json, error } from '@sveltejs/kit';
import { getPrivateSettingSync } from '@src/services/settingsService';

// Permission checking

// System Logger
import { logger } from '@utils/logger.server';

// Initialize ThemeManager singleton
const themeManager = ThemeManager.getInstance();

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals;

	// Authentication is handled by hooks.server.ts
	if (!user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		throw error(400, 'Tenant could not be identified for this operation.');
	}

	const { themeId } = await request.json();

	if (!themeId || typeof themeId !== 'string') {
		logger.warn(`Invalid theme ID provided: ${themeId}`, { tenantId });
		throw error(400, 'Invalid theme ID.');
	}

	try {
		if (!dbAdapter) {
			throw new Error('Database adapter is not initialized');
		}

		// Set the selected theme as the default in the database for the current tenant
		await dbAdapter.themes.setDefault(themeId as unknown as DatabaseId);

		// Invalidate theme cache to apply changes immediately
		await themeManager.refresh();

		// Fetch the updated default theme to confirm the change
		const updatedTheme: Theme = await themeManager.getTheme(tenantId);

		logger.info(`Default theme successfully set to '${updatedTheme.name}' by user '${user._id}'.`, { tenantId });

		return json({ success: true, theme: updatedTheme });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Error setting default theme:', { error: errorMessage, tenantId });
		return json({ success: false, error: `Error setting default theme: ${errorMessage}` }, { status: 500 });
	}
};
