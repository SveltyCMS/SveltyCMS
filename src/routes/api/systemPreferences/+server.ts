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

// Permissions

// System Logger
import { logger } from '@utils/logger.svelte';

export const GET = async ({ locals, url }) => {
	const { user, tenantId } = locals; // Check system preferences permissions
	const permissionResult = await checkApiPermission(user, {
		resource: 'systemPreferences',
		action: 'read'
	});

	if (!permissionResult.hasPermission) {
		logger.warn('Unauthorized attempt to load system preferences', {
			userId: user?._id,
			tenantId,
			error: permissionResult.error
		});
		return json(
			{
				error: permissionResult.error || 'Forbidden'
			},
			{
				status: permissionResult.error?.includes('Authentication') ? 401 : 403
			}
		);
	}

	if (privateEnv.MULTI_TENANT && !tenantId) {
		throw error(400, 'Tenant could not be identified for this operation.');
	} // Try to get userId from query param, otherwise use locals.user

	const userId = url.searchParams.get('userId') || user._id.toString(); // Handle widget state requests

	const widgetId = url.searchParams.get('widgetId');
	if (widgetId) {
		try {
			// Pass tenantId to the adapter method
			const state = await dbAdapter.systemPreferences.getWidgetState(userId, widgetId, tenantId);
			return json({ state });
		} catch (e) {
			logger.error('Failed to load widget state:', { error: e, tenantId });
			return json({ error: 'Failed to load widget state' }, { status: 500 });
		}
	} // Default system preferences load

	try {
		// Pass tenantId to the adapter method
		const preferences = await dbAdapter.systemPreferences.getSystemPreferences(userId, tenantId); // Return a flat array of widgets instead of nested preferences

		const response = {
			preferences: preferences || []
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

	const { preferences } = data;
	try {
		// Pass tenantId to the adapter method
		await dbAdapter.systemPreferences.setUserPreferences(userId, preferences, tenantId);
		return json({ success: true });
	} catch (e) {
		logger.error('Failed to save system preferences:', { error: e, tenantId });
		return json({ error: 'Failed to save preferences' }, { status: 500 });
	}
};
