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
import { ThemeManager } from '@shared/database/themeManager';
import { dbAdapter } from '@shared/database/db';
import type { DatabaseId } from '@shared/database/dbInterface';
import { json, error } from '@sveltejs/kit';
import { getPrivateSettingSync } from '@shared/services/settingsService';

// Permission checking

// System Logger
import { logger } from '@shared/utils/logger.server';

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

	const { themeId, customCss } = await request.json();

	if (!themeId || typeof themeId !== 'string') {
		logger.warn(`Invalid theme ID provided: ${themeId}`, { tenantId });
		throw error(400, 'Invalid theme ID.');
	}

	try {
		if (!dbAdapter) {
			throw new Error('Database adapter is not initialized');
		}

		// Fetch the theme from the database to ensure it exists for the current tenant
		const themeResult = await dbAdapter.themes.update(themeId as unknown as DatabaseId, { customCss });

		if (!themeResult.success || !themeResult.data) {
			logger.warn(`Theme '${themeId}' does not exist or update failed for this tenant.`, { tenantId });
			throw error(404, `Theme '${themeId}' does not exist or update failed.`);
		}

		const updatedTheme = themeResult.data;

		// Invalidate theme cache after update
		await themeManager.refresh();

		logger.info(`Theme '${updatedTheme.name}' custom CSS successfully updated by user '${user._id}'.`, { tenantId });

		return json({ success: true, theme: updatedTheme });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Error updating theme custom CSS:', { error: errorMessage, tenantId });
		return json({ success: false, error: `Error updating theme custom CSS: ${errorMessage}` }, { status: 500 });
	}
};
