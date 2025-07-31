/**
 * @file src/routes/api/dashboard/systemPreferences/+server.ts
 * @description Server-side API endpoint for saving, loading, and updating user dashboard system preferences.
 *
 * ### Usage
 * - POST to /api/systemPreferences with `{ preferences }` in the body to save user dashboard preferences.
 * - GET from /api/systemPreferences to load user dashboard preferences.
 * - PUT to /api/systemPreferences with `{ screenSize, widgets }` in the body to update a specific screen size's preferences.
 * - POST to /api/systemPreferences/widget-state to save individual widget state
 * - GET from /api/systemPreferences/widget-state?widgetId=ID to load individual widget state
 *
 * ### Features
 * - User authentication and authorization
 * - Persists user dashboard preferences to the database
 * - Update preferences for a specific screen size
 * - Proper error handling and logging
 */

import { dbAdapter } from '@src/databases/db';
import { json } from '@sveltejs/kit';

// Permissions

// System Logger
import { logger } from '@utils/logger.svelte';

// --- Validation  ---
import * as v from 'valibot';

const WidgetSchema = v.object({
	id: v.string(),
	component: v.string(),
	label: v.string(),
	icon: v.string(),
	size: v.enum(['1/4', '1/2', '3/4', 'full']),
	gridPosition: v.number()
	// NOTE: We don't need to validate x,y,w,h,movable etc. as they are for client-side libraries and not persisted.
});

const SavePreferencesBodySchema = v.object({
	preferences: v.array(WidgetSchema)
});

const UpdateScreenBodySchema = v.object({
	screenSize: v.enum(['SM', 'MD', 'LG', 'XL']),
	widgets: v.array(WidgetSchema)
});

const WidgetStateBodySchema = v.object({
	widgetId: v.string(),
	state: v.record(v.string(), v.any())
});

// --- API Handlers ---

export const GET = async ({ locals, url }) => {
	// Authentication is handled by hooks.server.ts
	if (!locals.user) {
		logger.warn('Unauthorized attempt to load system preferences');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user._id.toString();

	const widgetId = url.searchParams.get('widgetId');

	// Handle request for a single widget's state
	if (widgetId) {
		try {
			const state = await dbAdapter.systemPreferences.getWidgetState(userId, widgetId);
			return json({ state: state ?? {} });
		} catch (e) {
			logger.error(`Failed to load widget state for widgetId: ${widgetId}`, e);
			return json({ error: 'Failed to load widget state' }, { status: 500 });
		}
	}

	// Handle request for all dashboard preferences
	try {
		const preferences = await dbAdapter.systemPreferences.getSystemPreferences(userId);
		return json({
			preferences: preferences ?? { SM: [], MD: [], LG: [], XL: [] }
		});
	} catch (e) {
		logger.error('Failed to load system preferences:', e);
		return json({ error: 'Failed to load preferences' }, { status: 500 });
	}
};

export const POST = async ({ request, locals }) => {
	// Authentication is handled by hooks.server.ts
	if (!locals.user) {
		logger.warn('Unauthorized attempt to save system preferences');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user._id.toString();

	const data = await request.json();

	// Try to parse as widget state first
	const widgetStateResult = v.safeParse(WidgetStateBodySchema, data);
	if (widgetStateResult.success) {
		try {
			const { widgetId, state } = widgetStateResult.output;
			await dbAdapter.systemPreferences.setWidgetState(userId, widgetId, state);
			return json({ success: true, message: 'Widget state saved.' }, { status: 200 });
		} catch (e) {
			logger.error('Failed to save widget state:', e);
			return json({ error: 'Failed to save widget state' }, { status: 500 });
		}
	}

	// If not widget state, try to parse as full preferences
	const preferencesResult = v.safeParse(SavePreferencesBodySchema, data);
	if (preferencesResult.success) {
		try {
			await dbAdapter.systemPreferences.setUserPreferences(userId, preferencesResult.output.preferences);
			return json({ success: true, message: 'Preferences saved.' }, { status: 200 });
		} catch (e) {
			logger.error('Failed to save system preferences:', e);
			return json({ error: 'Failed to save preferences' }, { status: 500 });
		}
	}

	// If neither schema matches, return a validation error
	return json({ error: 'Invalid request data.', issues: preferencesResult.issues }, { status: 400 });
};

export const PUT = async ({ request, locals }) => {
	// Authentication is handled by hooks.server.ts
	if (!locals.user) {
		logger.warn('Unauthorized attempt to update system preferences');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user._id.toString();

	const data = await request.json();
	const result = v.safeParse(UpdateScreenBodySchema, data);

	if (!result.success) {
		return json({ error: 'Missing or invalid screenSize/widgets.', issues: result.issues }, { status: 400 });
	}

	try {
		const { screenSize, widgets } = result.output;
		await dbAdapter.systemPreferences.updateSystemPreferences(userId, screenSize, widgets);
		return json({ success: true }, { status: 200 });
	} catch (e) {
		logger.error('Failed to update system preferences:', e);
		return json({ error: 'Failed to update preferences' }, { status: 500 });
	}
};
