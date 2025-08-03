/**
 * @file src/routes/api/dashboard/systemPreferences/+server.ts
 * @description Server-side API endpoint for saving, loading, and updating user dashboard system preferences.
 *
 * ### Usage
 * - GET /api/systemPreferences?userId=...&layoutId=... to load user dashboard preferences for a specific layout.
 * - POST /api/systemPreferences with `{ userId, layoutId, layout }` to save a layout’s preferences.
 * - POST /api/systemPreferences/widget-state with `{ userId, widgetId, state }` to save individual widget state.
 * - GET /api/systemPreferences/widget-state?userId=...&widgetId=... to load individual widget state.
 *
 * ### Features
 * - User authentication and role-based authorization
 * - Persists user dashboard preferences to the database
 * - Supports multiple layouts with layoutId
 * - Stores widget-specific settings
 * - Proper error handling and logging
 */

import { dbAdapter } from '@src/databases/db';
import { json, error } from '@sveltejs/kit';
import { hasPermissionByAction } from '@src/auth/permissions';
import { logger } from '@utils/logger.svelte';
import * as v from 'valibot';

// Validation Schemas
const WidgetSchema = v.object({
	id: v.string(),
	component: v.string(),
	label: v.string(),
	icon: v.string(),
	size: v.enum(['1/4', '1/2', '3/4', 'full']),
	gridPosition: v.number([v.integer(), v.minValue(0)]),
	settings: v.optional(v.record(v.string(), v.any()), {}),
	movable: v.optional(v.boolean(), true),
	resizable: v.optional(v.boolean(), true)
});

const LayoutSchema = v.object({
	id: v.string(),
	name: v.string(),
	preferences: v.array(WidgetSchema)
});

const SavePreferencesBodySchema = v.object({
	userId: v.string(),
	layoutId: v.string(),
	layout: LayoutSchema
});

const WidgetStateBodySchema = v.object({
	userId: v.string(),
	widgetId: v.string(),
	state: v.record(v.string(), v.any())
});

// API Handlers
export const GET = async ({ locals, url }) => {
	if (!locals.user) {
		logger.warn('Unauthorized attempt to load system preferences');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!hasPermissionByAction(locals.user, 'read', 'dashboard', undefined, locals.roles)) {
		logger.warn(`User ${locals.user._id} lacks permission to read dashboard preferences`);
		return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
	}

	const userId = url.searchParams.get('userId');
	const layoutId = url.searchParams.get('layoutId') || 'default';
	const widgetId = url.searchParams.get('widgetId');

	if (userId !== locals.user._id.toString()) {
		logger.warn(`User ${locals.user._id} attempted to access preferences for user ${userId}`);
		return json({ error: 'Forbidden: Cannot access another user’s preferences' }, { status: 403 });
	}

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

	// Handle request for a layout’s preferences
	try {
		const layout = await dbAdapter.systemPreferences.getSystemPreferences(userId, layoutId);
		return json({ layout: layout ?? { id: layoutId, name: layoutId === 'default' ? 'Default' : layoutId, preferences: [] } });
	} catch (e) {
		logger.error(`Failed to load system preferences for userId: ${userId}, layoutId: ${layoutId}`, e);
		return json({ error: 'Failed to load preferences' }, { status: 500 });
	}
};

export const POST = async ({ request, locals }) => {
	if (!locals.user) {
		logger.warn('Unauthorized attempt to save system preferences');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!hasPermissionByAction(locals.user, 'manage', 'dashboard', undefined, locals.roles)) {
		logger.warn(`User ${locals.user._id} lacks permission to manage dashboard preferences`);
		return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
	}

	const data = await request.json();

	// Try to parse as widget state
	const widgetStateResult = v.safeParse(WidgetStateBodySchema, data);
	if (widgetStateResult.success) {
		const { userId, widgetId, state } = widgetStateResult.output;
		if (userId !== locals.user._id.toString()) {
			logger.warn(`User ${locals.user._id} attempted to save widget state for user ${userId}`);
			return json({ error: 'Forbidden: Cannot save another user’s widget state' }, { status: 403 });
		}
		try {
			await dbAdapter.systemPreferences.setWidgetState(userId, widgetId, state);
			return json({ success: true, message: 'Widget state saved.' }, { status: 200 });
		} catch (e) {
			logger.error(`Failed to save widget state for widgetId: ${widgetId}`, e);
			return json({ error: 'Failed to save widget state' }, { status: 500 });
		}
	}

	// Try to parse as layout preferences
	const preferencesResult = v.safeParse(SavePreferencesBodySchema, data);
	if (preferencesResult.success) {
		const { userId, layoutId, layout } = preferencesResult.output;
		if (userId !== locals.user._id.toString()) {
			logger.warn(`User ${locals.user._id} attempted to save preferences for user ${userId}`);
			return json({ error: 'Forbidden: Cannot save another user’s preferences' }, { status: 403 });
		}
		try {
			await dbAdapter.systemPreferences.setSystemPreferences(userId, layoutId, layout);
			return json({ success: true, message: 'Preferences saved.' }, { status: 200 });
		} catch (e) {
			logger.error(`Failed to save system preferences for userId: ${userId}, layoutId: ${layoutId}`, e);
			return json({ error: 'Failed to save preferences' }, { status: 500 });
		}
	}

	return json({ error: 'Invalid request data.', issues: preferencesResult.issues || widgetStateResult.issues }, { status: 400 });
};

export const PUT = async ({ request, locals }) => {
	if (!locals.user) {
		logger.warn('Unauthorized attempt to update system preferences');
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!hasPermissionByAction(locals.user, 'manage', 'dashboard', undefined, locals.roles)) {
		logger.warn(`User ${locals.user._id} lacks permission to manage dashboard preferences`);
		return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
	}

	const data = await request.json();
	const result = v.safeParse(UpdateScreenBodySchema, data);

	if (!result.success) {
		return json({ error: 'Missing or invalid screenSize/widgets.', issues: result.issues }, { status: 400 });
	}

	const { screenSize, widgets } = result.output;
	const userId = locals.user._id.toString();

	try {
		await dbAdapter.systemPreferences.updateSystemPreferences(userId, screenSize, widgets);
		return json({ success: true }, { status: 200 });
	} catch (e) {
		logger.error(`Failed to update system preferences for userId: ${userId}, screenSize: ${screenSize}`, e);
		return json({ error: 'Failed to update preferences' }, { status: 500 });
	}
};