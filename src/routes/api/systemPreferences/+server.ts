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
 * - Persists user dashboard preferences to the database, scoped to the current tenant.
 * - Update preferences for a specific screen size
 * - Proper error handling and logging
 */

import { dbAdapter } from '@src/databases/db';
import { json, error } from '@sveltejs/kit';
import { privateEnv } from '@root/config/private';

// System Logger
import { logger } from '@utils/logger.svelte';

export const GET = async ({ locals, url }) => {
	const { user, tenantId } = locals;

	// Authentication is handled by hooks.server.ts
	if (!user) {
		logger.warn('Unauthorized attempt to load system preferences', {
			tenantId
		});
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (privateEnv.MULTI_TENANT && !tenantId) {
		throw error(400, 'Tenant could not be identified for this operation.');
	} // Try to get userId from query param, otherwise use locals.user

	const userId = url.searchParams.get('userId') || user._id.toString(); // Handle widget state requests

	const widgetId = url.searchParams.get('widgetId');
	if (widgetId) {
		try {
			// Use "default" as the default layout ID for widget state
			const layoutId = url.searchParams.get('layoutId') || 'default';
			const state = await dbAdapter.systemPreferences.getWidgetState(userId, layoutId, widgetId);
			return json({ state });
		} catch (e) {
			logger.error('Failed to load widget state:', { error: e, tenantId });
			return json({ error: 'Failed to load widget state' }, { status: 500 });
		}
	} // Default system preferences load

	try {
		// Use "default" as the default layout ID
		const layoutId = url.searchParams.get('layoutId') || 'default';
		// Get the layout from the database
		const layout = await dbAdapter.systemPreferences.getSystemPreferences(userId, layoutId);

		const response = {
			preferences: layout?.preferences || []
		};
		return json(response);
	} catch (e) {
		logger.error('Failed to load system preferences:', { error: e, tenantId });
		return json({ error: 'Failed to load preferences' }, { status: 500 });
	}
};

export const POST = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	const data = await request.json(); // Try to get userId from request body, otherwise use locals.user

	const userId = data.userId || user?._id?.toString();
	if (!userId) {
		logger.warn('Unauthorized attempt to save system preferences.');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (privateEnv.MULTI_TENANT && !tenantId) {
		throw error(400, 'Tenant could not be identified for this operation.');
	} // Handle widget state persistence

	if (data.widgetId && data.state) {
		try {
			// Pass tenantId to the adapter method
			await dbAdapter.systemPreferences.setWidgetState(userId, data.widgetId, data.state, tenantId);
			return json({ success: true });
		} catch (e) {
			logger.error('Failed to save widget state:', { error: e, tenantId });
			return json({ error: 'Failed to save widget state' }, { status: 500 });
		}
	} // Default preferences save

	const { preferences, layoutId = 'default' } = data;
	try {
		// Create a layout object as expected by the database
		const layout = {
			id: layoutId,
			name: layoutId === 'default' ? 'Default Layout' : layoutId,
			preferences: preferences || []
		};
		// Save the user preferences
		await dbAdapter.systemPreferences.setUserPreferences(userId, layoutId, layout);
		return json({ success: true });
	} catch (e) {
		logger.error('Failed to save system preferences:', { error: e, tenantId });
		return json({ error: 'Failed to save preferences' }, { status: 500 });
	}
};
