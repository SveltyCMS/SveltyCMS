/**
 * @file src/routes/api/systemPreferences/+server.ts
 * @description Consolidated server-side API endpoint for managing system and user preferences.
 *
 * ### Usage
 * - GET /api/systemPreferences?key=... - Loads a specific preference value for the authenticated user.
 * - GET /api/systemPreferences?keys[]=...&keys[]=... - Loads multiple preference values for the user.
 * - POST /api/systemPreferences with `{ key, value }` - Saves a single preference for the user.
 * - POST /api/systemPreferences with `[{ key, value }, ...]` - Saves multiple preferences in a single request.
 * - DELETE /api/systemPreferences?key=... - Deletes a specific preference for the user.
 *
 * ### Features
 * - Unified endpoint for all user-scoped preferences (e.g., dashboard layouts, widget states).
 * - User authentication and role-based authorization.
 * - Robust validation using Valibot.
 * - Bulk operations for getting and setting multiple preferences.
 * - Consistent error handling and logging.
 */

import { dbAdapter } from '@src/databases/db';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hasPermissionByAction } from '@src/databases/auth/permissions';
import { logger } from '@utils/logger.server';
import * as v from 'valibot';

// Validation Schemas
const PreferenceSchema = v.object({
	key: v.pipe(v.string(), v.minLength(1, 'Preference key cannot be empty.')),
	value: v.any()
});

const SetSinglePreferenceSchema = PreferenceSchema;
const SetMultiplePreferencesSchema = v.array(PreferenceSchema);

// GET Handler for retrieving one or more preferences
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		logger.warn('Unauthorized attempt to load system preferences');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!hasPermissionByAction(locals.user, 'read', 'system_preferences', undefined, locals.roles)) {
		logger.warn(`User ${locals.user._id} lacks permission to read preferences`);
		return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
	}

	const userId = locals.user._id;
	const singleKey = url.searchParams.get('key');
	const multipleKeys = url.searchParams.getAll('keys[]');

	try {
		// Handle request for multiple keys
		if (multipleKeys.length > 0) {
			if (!dbAdapter) {
				throw new Error('Database adapter not available');
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await dbAdapter.systemPreferences.getMany(multipleKeys, 'user', userId as any);
			if (!result.success) {
				throw new Error(result.message);
			}
			return json(result.data);
		}

		// Handle request for a single key
		if (singleKey) {
			if (!dbAdapter) {
				throw new Error('Database adapter not available');
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await dbAdapter.systemPreferences.get(singleKey, 'user', userId as any);
			if (!result.success) {
				// Return a default value for layout preferences to prevent UI breakage
				if (singleKey.startsWith('dashboard.layout.')) {
					return json({ id: singleKey, name: 'Default', preferences: [] });
				}
				return json({ value: null }, { status: 404 });
			}
			return json(result.data);
		}

		return json({ error: "Invalid request. Provide 'key' or 'keys[]' query parameter." }, { status: 400 });
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : 'Unknown error';
		logger.error(`Failed to load preferences for user ${userId}: ${errorMessage}`, e);
		return json({ error: 'Failed to load preferences' }, { status: 500 });
	}
};

// POST Handler for creating or updating one or more preferences
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		logger.warn('Unauthorized attempt to save system preferences');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!hasPermissionByAction(locals.user, 'manage', 'system_preferences', undefined, locals.roles)) {
		logger.warn(`User ${locals.user._id} lacks permission to manage preferences`);
		return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
	}

	const data = await request.json();
	const userId = locals.user._id;

	try {
		// Try parsing as a single preference
		const singleResult = v.safeParse(SetSinglePreferenceSchema, data);
		if (singleResult.success) {
			if (!dbAdapter) {
				throw new Error('Database adapter not available');
			}
			const { key, value } = singleResult.output;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await dbAdapter.systemPreferences.set(key, value, 'user', userId as any);
			if (!result.success) throw new Error(result.message);
			return json({ success: true, message: `Preference '${key}' saved.` }, { status: 200 });
		}

		// Try parsing as multiple preferences
		const multipleResult = v.safeParse(SetMultiplePreferencesSchema, data);
		if (multipleResult.success) {
			if (!dbAdapter) {
				throw new Error('Database adapter not available');
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const preferencesToSet = multipleResult.output.map((p) => ({ ...p, scope: 'user' as const, userId: userId as any }));
			const result = await dbAdapter.systemPreferences.setMany(preferencesToSet);
			if (!result.success) throw new Error(result.message);
			return json({ success: true, message: `${preferencesToSet.length} preferences saved.` }, { status: 200 });
		}

		// If neither schema matches
		const issues = singleResult.issues || multipleResult.issues;
		return json({ error: 'Invalid request data.', issues }, { status: 400 });
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : 'Unknown error';
		logger.error(`Failed to save preferences for user ${userId}: ${errorMessage}`, e);
		return json({ error: 'Failed to save preferences' }, { status: 500 });
	}
};

// DELETE Handler for removing a preference
export const DELETE: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		logger.warn('Unauthorized attempt to delete a system preference');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!hasPermissionByAction(locals.user, 'manage', 'system_preferences', undefined, locals.roles)) {
		logger.warn(`User ${locals.user._id} lacks permission to delete preferences`);
		return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
	}

	const key = url.searchParams.get('key');
	if (!key) {
		return json({ error: "Missing 'key' query parameter." }, { status: 400 });
	}

	const userId = locals.user._id;

	try {
		if (!dbAdapter) {
			throw new Error('Database adapter not available');
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await dbAdapter.systemPreferences.delete(key, 'user', userId as any);
		if (!result.success) {
			// It might not be an error if the key didn't exist, but we log it just in case.
			logger.warn(`Attempted to delete non-existent preference key '${key}' for user ${userId}`);
		}
		return json({ success: true, message: `Preference '${key}' deleted.` }, { status: 200 });
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : 'Unknown error';
		logger.error(`Failed to delete preference '${key}' for user ${userId}: ${errorMessage}`, e);
		return json({ error: 'Failed to delete preference' }, { status: 500 });
	}
};
