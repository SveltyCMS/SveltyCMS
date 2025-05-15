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

import { json } from '@sveltejs/kit';
import { dbAdapter } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger.svelte';

export const GET = async ({ locals, url }) => {
    const user = locals.user;
    if (!user) {
        logger.warn('Unauthorized attempt to load system preferences.');
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Handle widget state requests
    const widgetId = url.searchParams.get('widgetId');
    if (widgetId) {
        try {
            const state = await dbAdapter.systemPreferences.getWidgetState(
                user._id.toString(),
                widgetId
            );
            return json({ state });
        } catch (e) {
            logger.error('Failed to load widget state:', e);
            return json({ error: 'Failed to load widget state' }, { status: 500 });
        }
    }

    // Default system preferences load
    try {
        const preferences = await dbAdapter.systemPreferences.getSystemPreferences(user._id.toString());
        return json({
            preferences: preferences ?? {
                SM: [],
                MD: [],
                LG: [],
                XL: []
            }
        });
    } catch (e) {
        logger.error('Failed to load system preferences:', e);
        return json({ error: 'Failed to load preferences' }, { status: 500 });
    }
};

export const POST = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        logger.warn('Unauthorized attempt to save system preferences.');
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    // Handle widget state persistence
    if (data.widgetId && data.state) {
        try {
            await dbAdapter.systemPreferences.setWidgetState(
                user._id.toString(),
                data.widgetId,
                data.state
            );
            return json({ success: true });
        } catch (e) {
            logger.error('Failed to save widget state:', e);
            return json({ error: 'Failed to save widget state' }, { status: 500 });
        }
    }

    // Default preferences save
    const { preferences } = data;
    try {
        await dbAdapter.systemPreferences.setUserPreferences(user._id.toString(), preferences);
        return json({ success: true });
    } catch (e) {
        logger.error('Failed to save system preferences:', e);
        return json({ error: 'Failed to save preferences' }, { status: 500 });
    }
};

export const PUT = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        logger.warn('Unauthorized attempt to update system preferences.');
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { screenSize, widgets } = await request.json();
        if (!screenSize || !Array.isArray(widgets)) {
            return json({ error: 'Missing or invalid screenSize/widgets' }, { status: 400 });
        }
        await dbAdapter.systemPreferences.updateSystemPreferences(user._id.toString(), screenSize, widgets);
        return json({ success: true });
    } catch (e) {
        logger.error('Failed to update system preferences:', e);
        return json({ error: 'Failed to update preferences' }, { status: 500 });
    }
};
