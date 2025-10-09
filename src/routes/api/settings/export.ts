/**
 * @file src/routes/api/settings/export.ts
 * @description API endpoint for exporting all system settings.
 *
 * This endpoint provides a secure way for authorized administrators to download
 * a complete JSON snapshot of the application's configuration. It retrieves
 * both public and private settings from the global settings store.
 *
 * @method GET
 * @auth Required (Checks for a valid user session and 'manage:settings' permission)
 * @returns {Response} A JSON file containing all system settings.
 */

// API endpoint to export all settings as a JSON snapshot
import { hasPermissionByAction } from '@src/databases/auth/permissions';
import { getAllSettings } from '@src/stores/globalSettings';
import { json, error, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
	// Use hasPermissionByAction for clarity
	if (!locals.user || !hasPermissionByAction(locals.user, 'manage', 'settings')) {
		throw error(403, 'Forbidden: You do not have permission to export settings.');
	}

	const settings = await getAllSettings();
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const filename = `sveltycms-settings-export-${timestamp}.json`;

	return json(settings, {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
