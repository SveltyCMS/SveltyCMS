/**
 * @file src/routes/api/theme/get-current-theme/+server.ts
 * @description Server-side handler for fetching the current theme for a tenant.
 */

import { ThemeManager } from '@src/databases/themeManager';
import { json } from '@sveltejs/kit';

// Permission checking

// System Logs
import { logger } from '@utils/logger.server';

// Get the singleton ThemeManager instance
const themeManager = ThemeManager.getInstance();

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

// ... (ThemeManager instance)

export const GET = apiHandler(async ({ locals }) => {
	const { user, tenantId } = locals; // User is guaranteed to exist due to hooks protection

	// Authentication is handled by hooks.server.ts
	if (!user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	// Note: tenantId validation is handled by hooks in multi-tenant mode
	const currentTheme = await themeManager.getTheme(tenantId);
	if (currentTheme) {
		logger.info('Current theme fetched successfully', { theme: currentTheme.name, tenantId });
		return json(currentTheme);
	} else {
		logger.warn('No active theme found for tenant', { tenantId });
		throw new AppError('No active theme found.', 404, 'THEME_NOT_FOUND');
	}
});
