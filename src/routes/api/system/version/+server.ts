/**
 * @file src/routes/api/system/version/+server.ts
 * @description API endpoint for checking system version and security updates.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { telemetryService } from '@src/services/TelemetryService';
import { dbAdapter } from '@src/databases/db';

export const GET: RequestHandler = async () => {
	// Ensure only authenticated users with admin rights can trigger a manual check if needed
	// But for the dashboard widget, we might want to allow it for any admin
	// For now, we'll rely on the service's internal caching and logic

	if (!dbAdapter) {
		return json({ status: 'error', message: 'Database not available' }, { status: 503 });
	}

	try {
		const status = await telemetryService.checkUpdateStatus();
		return json(status);
	} catch (error) {
		console.error('Version check failed:', error);
		return json({ status: 'error', message: 'Failed to check version' }, { status: 500 });
	}
};
