/**
 * @file src/routes/api/settings/import.ts
 * @description API endpoint for importing system settings from a JSON snapshot.
 *
 * This endpoint allows authorized administrators to restore the application's
 * configuration from a previously exported JSON file. It validates the user's
 * permissions, parses the snapshot, and uses the database adapter to apply
 * the settings, invalidating the server cache upon success.
 *
 * @method POST
 * @auth Required (Checks for a valid user session and 'manage:settings' permission)
 * @body {object} A JSON object representing the settings snapshot.
 * @returns {Response} A JSON object indicating success or failure.
 */
import { hasPermissionByAction } from '@src/databases/auth/permissions';
import { updateSettingsFromSnapshot } from '@src/services/settingsService';
import { error, json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!(locals.user && hasPermissionByAction(locals.user, 'manage', 'settings'))) {
		throw error(403, 'Forbidden: You do not have permission to import settings.');
	}

	try {
		const snapshot = await request.json();
		const result = await updateSettingsFromSnapshot(snapshot);
		return json({ success: true, result });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Invalid snapshot format';
		throw error(400, message);
	}
};
