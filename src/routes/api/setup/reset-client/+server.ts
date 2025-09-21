/**
 * @file src/routes/api/setup/reset-client/+server.ts
 * @description API endpoint to clear client-side storage (cookies, localStorage instructions)
 *              to ensure a clean state during fresh installation.
 */

import { json, type RequestHandler } from '@sveltejs/kit';

import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ cookies, request }) => {
	try {
		logger.info('Clearing client-side data for fresh install');

		// Get all cookie names from the request
		const requestHeaders = request.headers.get('cookie') || '';
		const cookieNames: string[] = [];

		if (requestHeaders) {
			requestHeaders.split(';').forEach((cookie) => {
				const name = cookie.split('=')[0]?.trim();
				if (name) {
					cookieNames.push(name);
				}
			});
		}

		// Clear all cookies by setting them to expire
		for (const cookieName of cookieNames) {
			cookies.set(cookieName, '', {
				path: '/',
				expires: new Date(0),
				httpOnly: false,
				secure: false,
				sameSite: 'lax'
			});
		}

		// Return instructions for client-side cleanup
		return json({
			success: true,
			clearLocalStorage: [
				// Setup wizard localStorage keys
				'setupWizard:dbConfig',
				'setupWizard:adminUser',
				'setupWizard:systemSettings',
				'setupWizard:currentStep',
				'setupWizard:highestStep',
				'setupWizard:dbTestPassed',
				// UI preferences that should be reset for fresh install
				'userTableSettings',
				'GalleryUserPreference',
				'userPaginationSettings',
				'systemLanguage',
				'navigation',
				// Skeleton UI preferences
				'modeOsPrefers',
				'modeUserPrefers',
				'modeCurrent',
				// Paraglide locale
				'PARAGLIDE_LOCALE'
			],
			clearSessionStorage: true, // Clear all sessionStorage
			clearCookies: cookieNames,
			message: 'Client state reset for fresh install.'
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
		logger.error('Failed to reset client state:', { error: errorMessage });
		return json({ success: false, error: 'Failed to clear client data.' }, { status: 500 });
	}
};
