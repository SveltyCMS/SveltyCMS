/**
 * @file src/routes/api/settings/[group]/+server.ts
 * @description Generic API endpoint for managing any settings group
 *
 * Handles GET/PUT/DELETE operations for all settings groups defined in settingsGroups.ts
 * Respects authentication and authorization patterns from hooks.server.ts
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPrivateSetting, getPublicSetting, invalidateSettingsCache } from '@src/stores/globalSettings';
import { getDb } from '@src/databases/db';
import { logger } from '@utils/logger.svelte';
import { getSettingGroup } from '@src/routes/(app)/config/systemsetting/settingsGroups';

/**
 * GET - Retrieve current settings for a group
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		// Authentication check (set by hooks.server.ts)
		if (!locals.user) {
			logger.warn('Unauthorized access attempt to settings API');
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { group } = params;

		// Get group definition
		const groupDef = getSettingGroup(group);
		if (!groupDef) {
			return json({ error: `Settings group '${group}' not found` }, { status: 404 });
		}

		// Authorization check - respect adminOnly flag
		const isAdmin = locals.user.role === 'admin';
		if (groupDef.adminOnly && !isAdmin) {
			logger.warn(`User ${locals.user._id} (role: ${locals.user.role}) attempted to access admin-only group: ${group}`);
			return json({ error: 'Insufficient permissions' }, { status: 403 });
		}

		// Load current values for all fields in the group
		const currentValues: Record<string, unknown> = {};

		for (const field of groupDef.fields) {
			try {
				// Use getUntypedSetting for dynamic field keys
				const value = field.category === 'private' ? getPrivateSetting(field.key as never) : getPublicSetting(field.key as never);
				currentValues[field.key] = value;
			} catch (error) {
				logger.warn(`Failed to load setting ${field.key}:`, error);
				currentValues[field.key] = null;
			}
		}

		return json({
			success: true,
			group: {
				id: groupDef.id,
				name: groupDef.name,
				description: groupDef.description,
				requiresRestart: groupDef.requiresRestart || false
			},
			values: currentValues
		});
	} catch (error) {
		logger.error('Failed to get settings:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to retrieve settings'
			},
			{ status: 500 }
		);
	}
};

/**
 * PUT - Update settings for a group
 */
export const PUT: RequestHandler = async ({ request, locals, params }) => {
	try {
		// Authentication check
		if (!locals.user) {
			logger.warn('Unauthorized settings update attempt');
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { group } = params;

		// Get group definition
		const groupDef = getSettingGroup(group);
		if (!groupDef) {
			return json({ error: `Settings group '${group}' not found` }, { status: 404 });
		}

		// Authorization check - respect adminOnly flag
		if (groupDef.adminOnly && !locals.user.isAdmin) {
			logger.warn(`User ${locals.user._id} attempted to update admin-only group: ${group}`);
			return json({ error: 'Insufficient permissions' }, { status: 403 });
		}

		// Parse request body
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

		// Update settings in database using systemPreferences interface
		const db = getDb();

		// Convert updates to array format for setMany
		const settingsArray = Object.entries(updates).map(([key, value]) => ({
			key,
			value,
			scope: 'system' as const
		}));

		const updateResult = await db.systemPreferences.setMany(settingsArray);

		if (!updateResult.success) {
			logger.error('Failed to update settings in database:', updateResult.error);
			return json(
				{
					success: false,
					error: 'Failed to save settings to database'
				},
				{ status: 500 }
			);
		}

		// Invalidate cache to ensure changes are picked up immediately
		invalidateSettingsCache();

		logger.info(`Settings group '${group}' updated successfully by user ${locals.user._id}`, {
			updatedKeys: Object.keys(updates)
		});

		return json({
			success: true,
			message: 'Settings updated successfully',
			requiresRestart: groupDef.requiresRestart || false
		});
	} catch (error) {
		logger.error('Failed to update settings:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to update settings'
			},
			{ status: 500 }
		);
	}
};

/**
 * DELETE - Reset settings to defaults for a group
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	try {
		// Authentication check
		if (!locals.user) {
			logger.warn('Unauthorized settings reset attempt');
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { group } = params;

		// Get group definition
		const groupDef = getSettingGroup(group);
		if (!groupDef) {
			return json({ error: `Settings group '${group}' not found` }, { status: 404 });
		}

		// Authorization check - must be admin to reset
		if (!locals.user.isAdmin) {
			logger.warn(`User ${locals.user._id} attempted to reset settings group: ${group}`);
			return json({ error: 'Insufficient permissions - admin only' }, { status: 403 });
		}

		// Get keys to reset
		const keysToReset = groupDef.fields.map((f) => f.key);

		// Delete current values from database
		const db = getDb();
		const deleteResult = await db.systemPreferences.deleteMany(keysToReset, 'system');

		if (!deleteResult.success) {
			logger.error('Failed to delete settings:', deleteResult.error);
			return json(
				{
					success: false,
					error: 'Failed to reset settings to defaults'
				},
				{ status: 500 }
			);
		}

		// Settings will be re-loaded from seed defaults on next access
		// Invalidate cache to force reload
		invalidateSettingsCache();

		logger.info(`Settings group '${group}' reset to defaults by user ${locals.user._id}`);

		return json({
			success: true,
			message: 'Settings reset to defaults',
			requiresRestart: groupDef.requiresRestart || false
		});
	} catch (error) {
		logger.error('Failed to reset settings:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to reset settings'
			},
			{ status: 500 }
		);
	}
};
