/**
 * @file src/routes/api/setup/reset-client/+server.ts
 * @description API endpoint to clear client-side storage (like session cookies)
 *              to ensure a clean state during initial setup.
 */

import { json, type RequestHandler } from '@sveltejs/kit';

import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ cookies }) => {
	try {
		// Clear the main session cookie by setting its expiration date to the past.
		// The cookie name 'SveltyCMS_Setup' is the default used by SveltyCMS Setup.
		cookies.set('SveltyCMS_Setup', '', {
			path: '/',
			expires: new Date(0)
		});

		logger.info('Client reset: Session cookie cleared successfully.');

		return json({ success: true, message: 'Client state reset.' });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
		logger.error('Failed to reset client state:', { error: errorMessage });
		return json({ success: false, error: 'Failed to clear session cookie.' }, { status: 500 });
	}
};
