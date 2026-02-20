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

import { dbAdapter } from '@src/databases/db';
import type { DatabaseId, Theme } from '@src/databases/db-interface';
import { ThemeManager } from '@src/databases/theme-manager';
import { getPrivateSettingSync } from '@src/services/settings-service';
import { json } from '@sveltejs/kit';

// Permission checking

// System Logger
import { logger } from '@utils/logger.server';

// Initialize ThemeManager singleton
const themeManager = ThemeManager.getInstance();

// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';

export const POST = apiHandler(async ({ request, locals }) => {
	const { user, tenantId } = locals;

	// Authentication is handled by hooks.server.ts
	if (!user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		throw new AppError('Tenant could not be identified for this operation.', 400, 'TENANT_REQUIRED');
	}

	const { themeId } = await request.json();

	if (!themeId || typeof themeId !== 'string') {
		logger.warn(`Invalid theme ID provided: ${themeId}`, { tenantId });
		throw new AppError('Invalid theme ID.', 400, 'INVALID_THEME_ID');
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
		logger.error('Error setting default theme:', {
			error: errorMessage,
			tenantId
		});
		throw new AppError(`Error setting default theme: ${errorMessage}`, 500, 'THEME_UPDATE_FAILED');
	}
});
