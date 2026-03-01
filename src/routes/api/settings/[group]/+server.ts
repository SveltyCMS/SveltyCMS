/**
 * @file src/routes/api/settings/[group]/+server.ts
 * @description Generic API endpoint for managing any settings group
 *
 * Handles GET/PUT/DELETE operations for all settings groups defined in settingsGroups.ts
 * Respects authentication and authorization patterns from hooks.server.ts
 */

import { dbAdapter } from '@src/databases/db';
import { getSettingGroup } from '@src/routes/(app)/config/systemsetting/settings-groups';
import { invalidateSettingsCache } from '@src/services/settings-service';
import { setRestartNeeded } from '@src/utils/server/restart-required';
import { updateVersion } from '@src/utils/server/settings-version';
import { json } from '@sveltejs/kit';
/**
 * GET - Retrieve current settings for a group
 * Strategy: Seed defaults as source of truth, overlay with database overrides
 */
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';
import { defaultPrivateSettings, defaultPublicSettings } from '../../../setup/seed';

/**
 * GET - Retrieve current settings for a group
 * Strategy: Seed defaults as source of truth, overlay with database overrides
 */
export const GET = apiHandler(async ({ locals, params }) => {
	if (!locals.user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	const { group: groupId } = params;
	const groupDef = getSettingGroup(groupId);

	if (!groupDef) {
		throw new AppError(`Settings group '${groupId}' not found`, 404, 'GROUP_NOT_FOUND');
	}

	// Authorization check
	if (groupDef.adminOnly && locals.user.role !== 'admin') {
		logger.warn(`User ${locals.user._id} (role: ${locals.user.role}) attempted to access admin-only group: ${groupId}`);
		throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
	}

	try {
		const fieldKeys = groupDef.fields.map((f) => f.key);

		// 1. Start with seed defaults as source of truth
		const finalValues: Record<string, unknown> = {};
		const allDefaults = [...defaultPublicSettings, ...defaultPrivateSettings];

		logger.debug(`[${groupId}] Looking for ${fieldKeys.length} keys in ${allDefaults.length} defaults`);

		for (const key of fieldKeys) {
			const found = allDefaults.find((s) => s.key === key);
			finalValues[key] = found ? found.value : undefined;
			if (!found) {
				logger.warn(`[${groupId}] No default found for key: ${key}`);
			}
		}

		logger.debug(`[${groupId}] Initial values from defaults:`, finalValues);

		// 2. Fetch database overrides
		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw new AppError('Database not initialized', 500, 'DB_UNAVAILABLE');
		}

		const dbResult = await dbAdapter.system.preferences.getMany(fieldKeys);

		// 3. Overlay database values over defaults
		if (dbResult.success && dbResult.data) {
			for (const [key, value] of Object.entries(dbResult.data)) {
				if (fieldKeys.includes(key)) {
					// Handle wrapped values from database
					if (value !== null && typeof value === 'object' && 'value' in value) {
						finalValues[key] = (value as Record<string, unknown>).value;
					} else {
						finalValues[key] = value;
					}
				}
			}
		}

		logger.info(`[${groupId}] Settings retrieved for user ${locals.user._id}`);

		return json({
			success: true,
			group: {
				id: groupDef.id,
				name: groupDef.name,
				description: groupDef.description,
				requiresRestart: groupDef.requiresRestart
			},
			values: finalValues
		});
	} catch (err) {
		if (err instanceof AppError) {
			throw err;
		}
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		const errorStack = err instanceof Error ? err.stack : undefined;
		logger.error(`Failed to get settings for group '${groupId}':`, {
			message: errorMessage,
			stack: errorStack,
			err
		});
		throw new AppError('Failed to retrieve settings', 500, 'FETCH_FAILED');
	}
});

/**
 * PUT - Update settings for a group
 * Validates all input and saves to database
 */
export const PUT = apiHandler(async ({ request, locals, params }) => {
	if (!locals.user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	const { group: groupId } = params;
	const groupDef = getSettingGroup(groupId);

	if (!groupDef) {
		throw new AppError(`Settings group '${groupId}' not found`, 404, 'GROUP_NOT_FOUND');
	}

	// Authorization check
	if (groupDef.adminOnly && locals.user.role !== 'admin') {
		logger.warn(`User ${locals.user._id} attempted to update admin-only group: ${groupId}`);
		throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
	}

	try {
		const updates = await request.json();

		// Validate that only fields from this group are being updated
		const validKeys = groupDef.fields.map((f) => f.key);
		const updateKeys = Object.keys(updates);

		for (const key of updateKeys) {
			if (!validKeys.includes(key)) {
				throw new AppError(`Invalid setting key for this group: ${key}`, 400, 'INVALID_KEY');
			}
		}

		// Validate each field according to its definition
		const errors: Record<string, string> = {};

		for (const field of groupDef.fields) {
			if (field.key in updates) {
				const value = updates[field.key];

				// Required check
				if (field.required && (value === null || value === undefined || value === '')) {
					errors[field.key] = `${field.label} is required`;
					continue;
				}

				// Skip further validation if value is null/undefined and not required
				if (value === null || value === undefined) {
					continue;
				}

				// Type validation
				if (field.type === 'number') {
					if (typeof value !== 'number' || Number.isNaN(value)) {
						errors[field.key] = `${field.label} must be a valid number`;
						continue;
					}
					if (field.min !== undefined && value < field.min) {
						errors[field.key] = `${field.label} must be at least ${field.min}`;
						continue;
					}
					if (field.max !== undefined && value > field.max) {
						errors[field.key] = `${field.label} must be at most ${field.max}`;
						continue;
					}
				}

				if (field.type === 'boolean' && typeof value !== 'boolean') {
					errors[field.key] = `${field.label} must be a boolean`;
					continue;
				}

				if ((field.type === 'text' || field.type === 'password') && typeof value !== 'string') {
					errors[field.key] = `${field.label} must be a string`;
					continue;
				}

				if (field.type === 'array' && !Array.isArray(value)) {
					errors[field.key] = `${field.label} must be an array`;
					continue;
				}

				// Custom validation
				if (field.validation) {
					const validationError = field.validation(value);
					if (validationError) {
						errors[field.key] = validationError;
					}
				}
			}
		}

		// Return validation errors if any
		if (Object.keys(errors).length > 0) {
			return json(
				{
					success: false,
					error: 'Validation failed',
					errors
				},
				{ status: 400 }
			);
		}

		// Update settings in database
		const settingsArray = Object.entries(updates).map(([key, value]) => ({
			key,
			value,
			scope: 'system' as const
		}));

		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw new AppError('Database not initialized', 500, 'DB_UNAVAILABLE');
		}

		const updateResult = await dbAdapter.system.preferences.setMany(settingsArray);

		if (!updateResult.success) {
			logger.error('Failed to update settings in database:', updateResult.error);
			throw new AppError('Failed to save settings to database', 500, 'SAVE_FAILED');
		}

		// Invalidate cache and reload settings from database to make changes immediately available
		invalidateSettingsCache();
		const { loadSettingsFromDB } = await import('@src/databases/db');
		await loadSettingsFromDB();

		// Update the settings version to notify clients
		updateVersion();

		if (groupDef.requiresRestart) {
			setRestartNeeded(true);
		}

		logger.info(`Settings group '${groupId}' updated by user ${locals.user._id}`, {
			keys: Object.keys(updates)
		});

		return json({
			success: true,
			message: 'Settings updated successfully',
			requiresRestart: groupDef.requiresRestart
		});
	} catch (err) {
		if (err instanceof AppError) {
			throw err;
		}
		logger.error(`Failed to update settings for group '${groupId}':`, err);
		throw new AppError('Failed to update settings', 500, 'UPDATE_FAILED');
	}
});

/**
 * DELETE - Reset settings to defaults for a group
 * Removes database overrides, allowing defaults to take effect
 */
export const DELETE = apiHandler(async ({ locals, params }) => {
	if (!locals.user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	// Must be admin to reset settings
	if (locals.user.role !== 'admin') {
		logger.warn(`User ${locals.user._id} attempted to reset settings without admin privileges`);
		throw new AppError('Insufficient permissions - admin only', 403, 'FORBIDDEN');
	}

	const { group: groupId } = params;
	const groupDef = getSettingGroup(groupId);

	if (!groupDef) {
		throw new AppError(`Settings group '${groupId}' not found`, 404, 'GROUP_NOT_FOUND');
	}

	try {
		const keysToReset = groupDef.fields.map((f) => f.key);

		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw new AppError('Database not initialized', 500, 'DB_UNAVAILABLE');
		}

		// Delete database overrides - settings will revert to seed defaults
		const deleteResult = await dbAdapter.system.preferences.deleteMany(keysToReset);

		if (!deleteResult.success) {
			logger.error('Failed to delete settings:', deleteResult.error);
			throw new AppError('Failed to reset settings to defaults', 500, 'RESET_FAILED');
		}

		// Invalidate cache and reload settings from database to make changes immediately available
		invalidateSettingsCache();
		const { loadSettingsFromDB } = await import('@src/databases/db');
		await loadSettingsFromDB();

		// Update the settings version to notify clients
		updateVersion();

		if (groupDef.requiresRestart) {
			setRestartNeeded(true);
		}

		logger.info(`Settings group '${groupId}' reset to defaults by user ${locals.user._id}`);

		return json({
			success: true,
			message: 'Settings reset to defaults',
			requiresRestart: groupDef.requiresRestart
		});
	} catch (err) {
		if (err instanceof AppError) {
			throw err;
		}
		logger.error(`Failed to reset settings for group '${groupId}':`, err);
		throw new AppError('Failed to reset settings', 500, 'RESET_FAILED');
	}
});
