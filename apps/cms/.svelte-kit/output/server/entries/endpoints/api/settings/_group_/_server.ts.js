import { error, json } from '@sveltejs/kit';
import { invalidateSettingsCache } from '../../../../../chunks/settingsService.js';
import { d as dbAdapter } from '../../../../../chunks/db.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { g as getSettingGroup, d as defaultPublicSettings, a as defaultPrivateSettings } from '../../../../../chunks/defaults.js';
import { u as updateVersion } from '../../../../../chunks/settingsVersion.js';
import { s as setRestartNeeded } from '../../../../../chunks/restartRequired.js';
const GET = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}
	const { group: groupId } = params;
	const groupDef = getSettingGroup(groupId);
	if (!groupDef) {
		throw error(404, `Settings group '${groupId}' not found`);
	}
	if (groupDef.adminOnly && locals.user.role !== 'admin') {
		logger.warn(`User ${locals.user._id} (role: ${locals.user.role}) attempted to access admin-only group: ${groupId}`);
		throw error(403, 'Insufficient permissions');
	}
	try {
		const fieldKeys = groupDef.fields.map((f) => f.key);
		const finalValues = {};
		const allDefaults = [...defaultPublicSettings, ...defaultPrivateSettings];
		logger.debug(`[${groupId}] Looking for ${fieldKeys.length} keys in ${allDefaults.length} defaults`);
		for (const key of fieldKeys) {
			const found = allDefaults.find((s) => s.key === key);
			finalValues[key] = found ? found.value : void 0;
			if (!found) {
				logger.warn(`[${groupId}] No default found for key: ${key}`);
			}
		}
		logger.debug(`[${groupId}] Initial values from defaults:`, finalValues);
		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw error(500, 'Database not initialized');
		}
		const dbResult = await dbAdapter.systemPreferences.getMany(fieldKeys);
		if (dbResult.success && dbResult.data) {
			for (const [key, value] of Object.entries(dbResult.data)) {
				if (fieldKeys.includes(key)) {
					if (value !== null && typeof value === 'object' && 'value' in value) {
						finalValues[key] = value.value;
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
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		const errorStack = err instanceof Error ? err.stack : void 0;
		logger.error(`Failed to get settings for group '${groupId}':`, { message: errorMessage, stack: errorStack, err });
		throw error(500, 'Failed to retrieve settings');
	}
};
const PUT = async ({ request, locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}
	const { group: groupId } = params;
	const groupDef = getSettingGroup(groupId);
	if (!groupDef) {
		throw error(404, `Settings group '${groupId}' not found`);
	}
	if (groupDef.adminOnly && locals.user.role !== 'admin') {
		logger.warn(`User ${locals.user._id} attempted to update admin-only group: ${groupId}`);
		throw error(403, 'Insufficient permissions');
	}
	try {
		const updates = await request.json();
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
		const errors = {};
		for (const field of groupDef.fields) {
			if (field.key in updates) {
				const value = updates[field.key];
				if (field.required && (value === null || value === void 0 || value === '')) {
					errors[field.key] = `${field.label} is required`;
					continue;
				}
				if (value === null || value === void 0) {
					continue;
				}
				if (field.type === 'number') {
					if (typeof value !== 'number' || isNaN(value)) {
						errors[field.key] = `${field.label} must be a valid number`;
						continue;
					}
					if (field.min !== void 0 && value < field.min) {
						errors[field.key] = `${field.label} must be at least ${field.min}`;
						continue;
					}
					if (field.max !== void 0 && value > field.max) {
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
				if (field.validation) {
					const validationError = field.validation(value);
					if (validationError) {
						errors[field.key] = validationError;
						continue;
					}
				}
			}
		}
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
		const settingsArray = Object.entries(updates).map(([key, value]) => ({
			key,
			value,
			scope: 'system'
		}));
		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw error(500, 'Database not initialized');
		}
		const updateResult = await dbAdapter.systemPreferences.setMany(settingsArray);
		if (!updateResult.success) {
			logger.error('Failed to update settings in database:', updateResult.error);
			throw error(500, 'Failed to save settings to database');
		}
		invalidateSettingsCache();
		const { loadSettingsFromDB } = await import('../../../../../chunks/db.js').then((n) => n.e);
		await loadSettingsFromDB();
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
			requiresRestart: groupDef.requiresRestart || false
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		logger.error(`Failed to update settings for group '${groupId}':`, err);
		throw error(500, 'Failed to update settings');
	}
};
const DELETE = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}
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
		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw error(500, 'Database not initialized');
		}
		const deleteResult = await dbAdapter.systemPreferences.deleteMany(keysToReset);
		if (!deleteResult.success) {
			logger.error('Failed to delete settings:', deleteResult.error);
			throw error(500, 'Failed to reset settings to defaults');
		}
		invalidateSettingsCache();
		const { loadSettingsFromDB } = await import('../../../../../chunks/db.js').then((n) => n.e);
		await loadSettingsFromDB();
		updateVersion();
		if (groupDef.requiresRestart) {
			setRestartNeeded(true);
		}
		logger.info(`Settings group '${groupId}' reset to defaults by user ${locals.user._id}`);
		return json({
			success: true,
			message: 'Settings reset to defaults',
			requiresRestart: groupDef.requiresRestart || false
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		logger.error(`Failed to reset settings for group '${groupId}':`, err);
		throw error(500, 'Failed to reset settings');
	}
};
export { DELETE, GET, PUT };
//# sourceMappingURL=_server.ts.js.map
