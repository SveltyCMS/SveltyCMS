/**
 * @file src/routes/api/settings/update/+server.ts
 * @description API endpoint to update system settings in the database.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb } from '@src/databases/db';
import { logger } from '@utils/logger.svelte';
import { invalidateSettingsCache } from '@src/stores/globalSettings';

export const POST: RequestHandler = async ({ request, locals }) => {
	// 1. Authentication
	if (!locals.user) {
		return json({ success: false, message: 'Unauthorized' }, { status: 401 });
	}
	// TODO: Add role-based authorization check if needed

	try {
		const settingsToUpdate = (await request.json()) as Record<string, unknown>;

		if (!settingsToUpdate || Object.keys(settingsToUpdate).length === 0) {
			return json({ success: false, message: 'No settings provided to update.' }, { status: 400 });
		}

		// 2. Get database adapter
		const db = getDb();

		// 3. Update settings in the database
		// The db.settings.updateSettings method should handle updating one or more settings.
		const updateResult = await db.settings.updateSettings(settingsToUpdate);

		if (!updateResult.success) {
			logger.error('Failed to update settings in database:', updateResult.error);
			return json({ success: false, message: 'Failed to save settings.' }, { status: 500 });
		}

		// 4. Invalidate the cache to ensure changes are picked up immediately
		invalidateSettingsCache();

		logger.info('System settings updated successfully by user:', { user: locals.user.email });

		return json({ success: true, message: 'Settings saved successfully.' });
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error processing settings update request:', { error: errorMessage });
		return json({ success: false, message: `An error occurred: ${errorMessage}` }, { status: 500 });
	}
};
