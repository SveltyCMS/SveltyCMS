/**
 * @file src/routes/api/settings/[group]/+server.ts
 * @description Generic API endpoint for managing any settings group
 *
 * Handles GET/PUT/DELETE operations for all settings groups defined in settingsGroups.ts
 * Respects authentication and authorization patterns from hooks.server.ts
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { invalidateSettingsCache } from '@src/stores/globalSettings';
import { dbAdapter } from '@src/databases/db';
import { logger } from '@utils/logger.svelte';
import { getSettingGroup } from '@src/routes/(app)/config/systemsetting/settingsGroups';
import { defaultPublicSettings, defaultPrivateSettings } from '../../setup/seed';

/**
 * GET - Retrieve current settings for a group
 * Strategy: Seed defaults as source of truth, overlay with database overrides
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { group: groupId } = params;
	const groupDef = getSettingGroup(groupId);

	if (!groupDef) {
		throw error(404, `Settings group '${groupId}' not found`);
	}

	// Authorization check
	if (groupDef.adminOnly && locals.user.role !== 'admin') {
		logger.warn(`User ${locals.user._id} (role: ${locals.user.role}) attempted to access admin-only group: ${groupId}`);
		throw error(403, 'Insufficient permissions');
	}

	try {
		const fieldKeys = groupDef.fields.map((f) => f.key);

		// 1. Start with seed defaults as source of truth
		const finalValues: Record<string, unknown> = {};
		const allDefaults = [...defaultPublicSettings, ...defaultPrivateSettings];
		for (const key of fieldKeys) {
			const found = allDefaults.find((s) => s.key === key);
			finalValues[key] = found ? found.value : undefined;
		}

		// 2. Fetch database overrides
		const dbResult = await dbAdapter.systemPreferences.getMany(fieldKeys);

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
				requiresRestart: groupDef.requiresRestart || false
			},
			values: finalValues
		});
	} catch (err) {
		logger.error(`Failed to get settings for group '${groupId}':`, err);
		throw error(500, 'Failed to retrieve settings');
	}
};

/**
 * PUT - Update settings for a group
 * Validates all input and saves to database
 */
export const PUT: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { group: groupId } = params;
	const groupDef = getSettingGroup(groupId);

	if (!groupDef) {
		throw error(404, `Settings group '${groupId}' not found`);
	}

	// Authorization check
	if (groupDef.adminOnly && locals.user.role !== 'admin') {
		logger.warn(`User ${locals.user._id} attempted to update admin-only group: ${groupId}`);
		throw error(403, 'Insufficient permissions');
	}

	try {
		const updates = await request.json();

		// Validate that only fields from this group are being updated
		const validKeys = groupDef.fields.map((f) => f.key);
		const updateKeys = Object.keys(updates);

		for (const key of updateKeys) {
			if (!validKeys.includes(key)) {
				return json(
					{
						success: false,
						error: `Invalid setting key for this group: ${key}`
					},
					{ status: 400 }
				);
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
					if (typeof value !== 'number' || isNaN(value)) {
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
						continue;
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

		const updateResult = await dbAdapter.systemPreferences.setMany(settingsArray);

		if (!updateResult.success) {
			logger.error('Failed to update settings in database:', updateResult.error);
			throw error(500, 'Failed to save settings to database');
		}

		// Invalidate cache to ensure changes are picked up immediately
		invalidateSettingsCache();

		logger.info(`Settings group '${groupId}' updated by user ${locals.user._id}`, {
			keys: Object.keys(updates)
		});

		return json({
			success: true,
			message: 'Settings updated successfully',
			requiresRestart: groupDef.requiresRestart || false
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err; // Re-throw SvelteKit errors
		}
		logger.error(`Failed to update settings for group '${groupId}':`, err);
		throw error(500, 'Failed to update settings');
	}
};

/**
 * DELETE - Reset settings to defaults for a group
 * Removes database overrides, allowing defaults to take effect
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// Must be admin to reset settings
	if (locals.user.role !== 'admin') {
		logger.warn(`User ${locals.user._id} attempted to reset settings without admin privileges`);
		throw error(403, 'Insufficient permissions - admin only');
	}

	const { group: groupId } = params;
	const groupDef = getSettingGroup(groupId);

	if (!groupDef) {
		throw error(404, `Settings group '${groupId}' not found`);
	}

	try {
		const keysToReset = groupDef.fields.map((f) => f.key);

		// Delete database overrides - settings will revert to seed defaults
		const deleteResult = await dbAdapter.systemPreferences.deleteMany(keysToReset);

		if (!deleteResult.success) {
			logger.error('Failed to delete settings:', deleteResult.error);
			throw error(500, 'Failed to reset settings to defaults');
		}

		// Invalidate cache to force reload from defaults
		invalidateSettingsCache();

		logger.info(`Settings group '${groupId}' reset to defaults by user ${locals.user._id}`);

		return json({
			success: true,
			message: 'Settings reset to defaults',
			requiresRestart: groupDef.requiresRestart || false
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err; // Re-throw SvelteKit errors
		}
		logger.error(`Failed to reset settings for group '${groupId}':`, err);
		throw error(500, 'Failed to reset settings');
	}
};
