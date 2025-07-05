/**
 * @file src/routes/api/systemPreferences/+server.ts
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

// System Logger
import { logger } from '@utils/logger.svelte';

export const GET = async ({ locals, url }) => {
	// Try to get userId from query param, otherwise use locals.user
	const userId = url.searchParams.get('userId') || locals.user?._id?.toString();

	if (!userId) {
		logger.warn('Unauthorized attempt to load system preferences.');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Handle widget state requests
	const widgetId = url.searchParams.get('widgetId');
	if (widgetId) {
		try {
			const state = await dbAdapter.systemPreferences.getWidgetState(userId, widgetId);
			return json({ state });
		} catch (e) {
			logger.error('Failed to load widget state:', e);
			return json({ error: 'Failed to load widget state' }, { status: 500 });
		}
	}

	// Default system preferences load
	try {
		const preferences = await dbAdapter.systemPreferences.getSystemPreferences(userId);

		// Return a flat array of widgets instead of nested preferences
		const response = {
			preferences: preferences || []
		};
		return json(response);
	} catch (e) {
		logger.error('Failed to load system preferences:', e);
		return json({ error: 'Failed to load preferences' }, { status: 500 });
	}
};

export const POST = async ({ request, locals }) => {
	const data = await request.json();

	// Try to get userId from request body, otherwise use locals.user
	const userId = data.userId || locals.user?._id?.toString();
	if (!userId) {
		logger.warn('Unauthorized attempt to save system preferences.');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Handle widget state persistence
	if (data.widgetId && data.state) {
		try {
			await dbAdapter.systemPreferences.setWidgetState(userId, data.widgetId, data.state);
			return json({ success: true });
		} catch (e) {
			logger.error('Failed to save widget state:', e);
			return json({ error: 'Failed to save widget state' }, { status: 500 });
		}
	}

	// Default preferences save
	const { preferences } = data;
	try {
		await dbAdapter.systemPreferences.setUserPreferences(userId, preferences);
		return json({ success: true });
	} catch (e) {
		logger.error('Failed to save system preferences:', e);
		return json({ error: 'Failed to save preferences' }, { status: 500 });
	}
};
