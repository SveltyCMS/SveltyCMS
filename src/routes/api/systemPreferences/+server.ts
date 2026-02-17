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
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

// GET Handler for retrieving one or more preferences
export const GET = apiHandler(async ({ locals, url }) => {
	if (!locals.user) {
		logger.warn('Unauthorized attempt to load system preferences');
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	// Allow any authenticated user to read their own preferences
	// The endpoint is scoped to the current user (userId = locals.user._id)
	// so they cannot read other users' preferences or system-wide settings here.

	const userId = locals.user._id;
	const singleKey = url.searchParams.get('key');
	const multipleKeys = url.searchParams.getAll('keys[]');

	try {
		// Handle request for multiple keys
		if (multipleKeys.length > 0) {
			if (!dbAdapter) {
				throw new AppError('Database adapter not available', 500, 'DB_UNAVAILABLE');
			}
			const result = await dbAdapter.systemPreferences.getMany(multipleKeys, 'user', userId as any);
			if (!result.success) {
				throw new Error(result.message);
			}
			return json(result.data);
		}

		// Handle request for a single key
		if (singleKey) {
			if (!dbAdapter) {
				throw new AppError('Database adapter not available', 500, 'DB_UNAVAILABLE');
			}
			const result = await dbAdapter.systemPreferences.get(singleKey, 'user', userId as any);
			if (!result.success) {
				// Return a default value for layout preferences to prevent UI breakage
				if (singleKey.startsWith('dashboard.layout.')) {
					return json({ id: singleKey, name: 'Default', preferences: [] });
				}
				throw new AppError('Preference not found', 404, 'NOT_FOUND');
			}
			return json(result.data);
		}

		throw new AppError("Invalid request. Provide 'key' or 'keys[]' query parameter.", 400, 'INVALID_REQUEST');
	} catch (e) {
		if (e instanceof AppError) {
			throw e;
		}
		const errorMessage = e instanceof Error ? e.message : 'Unknown error';
		logger.error(`Failed to load preferences for user ${userId}: ${errorMessage}`, e);
		throw new AppError('Failed to load preferences', 500, 'FETCH_FAILED');
	}
});

// POST Handler for creating or updating one or more preferences
export const POST = apiHandler(async ({ request, locals }) => {
	if (!locals.user) {
		logger.warn('Unauthorized attempt to save system preferences');
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	// Allow any authenticated user to manage their own preferences
	// The endpoint is scoped to the current user (userId = locals.user._id)
	// so they cannot modify other users' preferences or system-wide settings here.

	const data = await request.json();
	const userId = locals.user._id;

	try {
		// Try parsing as a single preference
		const singleResult = v.safeParse(SetSinglePreferenceSchema, data);
		if (singleResult.success) {
			if (!dbAdapter) {
				throw new AppError('Database adapter not available', 500, 'DB_UNAVAILABLE');
			}
			const { key, value } = singleResult.output;
			const result = await dbAdapter.systemPreferences.set(key, value, 'user', userId as any);
			if (!result.success) {
				throw new Error(result.message);
			}
			return json({ success: true, message: `Preference '${key}' saved.` }, { status: 200 });
		}

		// Try parsing as multiple preferences
		const multipleResult = v.safeParse(SetMultiplePreferencesSchema, data);
		if (multipleResult.success) {
			if (!dbAdapter) {
				throw new AppError('Database adapter not available', 500, 'DB_UNAVAILABLE');
			}
			const preferencesToSet = multipleResult.output.map((p) => ({ ...p, scope: 'user' as const, userId: userId as any }));
			const result = await dbAdapter.systemPreferences.setMany(preferencesToSet);
			if (!result.success) {
				throw new Error(result.message);
			}
			return json({ success: true, message: `${preferencesToSet.length} preferences saved.` }, { status: 200 });
		}

		// If neither schema matches
		const issues = singleResult.issues || multipleResult.issues;
		// Instead of returning JSON error, throw AppError to be consistent
		// However, AppError doesn't easily support attaching 'issues'.
		// We'll log issues and return generic error or stringified issues.
		logger.warn('Invalid preference data', { issues });
		throw new AppError('Invalid request data.', 400, 'INVALID_DATA');
	} catch (e) {
		if (e instanceof AppError) {
			throw e;
		}
		const errorMessage = e instanceof Error ? e.message : 'Unknown error';
		logger.error(`Failed to save preferences for user ${userId}: ${errorMessage}`, e);
		throw new AppError('Failed to save preferences', 500, 'SAVE_FAILED');
	}
});

// DELETE Handler for removing a preference
export const DELETE = apiHandler(async ({ locals, url }) => {
	if (!locals.user) {
		logger.warn('Unauthorized attempt to delete a system preference');
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	// Allow any authenticated user to delete their own preferences
	// The endpoint is scoped to the current user (userId = locals.user._id)
	// so they cannot delete other users' preferences or system-wide settings here.

	const key = url.searchParams.get('key');
	if (!key) {
		throw new AppError("Missing 'key' query parameter.", 400, 'MISSING_KEY');
	}

	const userId = locals.user._id;

	try {
		if (!dbAdapter) {
			throw new AppError('Database adapter not available', 500, 'DB_UNAVAILABLE');
		}
		const result = await dbAdapter.systemPreferences.delete(key, 'user', userId as any);
		if (!result.success) {
			// It might not be an error if the key didn't exist, but we log it just in case.
			logger.warn(`Attempted to delete non-existent preference key '${key}' for user ${userId}`);
		}
		return json({ success: true, message: `Preference '${key}' deleted.` }, { status: 200 });
	} catch (e) {
		if (e instanceof AppError) {
			throw e;
		}
		const errorMessage = e instanceof Error ? e.message : 'Unknown error';
		logger.error(`Failed to delete preference '${key}' for user ${userId}: ${errorMessage}`, e);
		throw new AppError('Failed to delete preference', 500, 'DELETE_FAILED');
	}
});
