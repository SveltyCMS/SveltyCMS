/**
 * @file src/hooks/handleSetup.ts
 * @description Middleware to manage the initial application setup process.
 *
 * This hook uses a memoized check for setup completion. If setup is not complete,
 * it efficiently intercepts requests and redirects to the '/setup' page.
 */

import { redirect, type Handle } from '@sveltejs/kit';

// System Logger
import { logger } from '@utils/logger.svelte';

import { isSetupComplete } from '@utils/setupCheck';

// Regex to quickly identify asset requests that should always be allowed.
const ASSET_REGEX = /^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|favicon\.ico|.*\.(svg|png|jpg|jpeg|gif|css|js))/;

export const handleSetup: Handle = async ({ event, resolve }) => {
	// Check setup status dynamically (not cached at module level)
	const isSetupCompleteCached = isSetupComplete();

	// --- Branch 1: Setup is NOT complete ---
	if (!isSetupCompleteCached) {
		// Log the initial status only when needed.
		logger.warn('System setup is not complete. Starting Setup again...');

		// Allow requests to the setup page, its API, and essential assets to pass through.
		if (event.url.pathname.startsWith('/setup') || event.url.pathname.startsWith('/api/setup') || ASSET_REGEX.test(event.url.pathname)) {
			// For setup-related paths, resolve immediately and skip the rest of the middleware pipeline.
			// This prevents warnings from auth/theme hooks that are not yet configured.
			return resolve(event, {
				// Allow Set-Cookie so setup API endpoints (e.g., /api/setup/complete)
				// can establish the initial admin session before redirecting out of setup.
				filterSerializedResponseHeaders: (name) => {
					const lower = name.toLowerCase();
					return lower.startsWith('content-') || lower.startsWith('etag') || lower === 'set-cookie';
				}
			});
		}

		// For everything else, redirect to the setup page.
		throw redirect(302, '/setup');
	}

	// --- Branch 2: Setup IS complete ---

	// Prevent access to the setup page UI after completion.
	if (event.url.pathname.startsWith('/setup') && !event.url.pathname.startsWith('/api/setup')) {
		throw redirect(302, '/login');
	}

	// Initialize the database on the first real request *after* setup is complete.
	try {
		const { initializeOnRequest, getSystemStatus } = await import('@src/databases/db');
		const status = getSystemStatus();

		if (!status.initialized && !status.initializing) {
			await initializeOnRequest();
		}
	} catch (error) {
		logger.error('Failed to initialize database system:', error);
		// Decide if you want to throw an error page here or allow the app to continue.
	}

	// Proceed with the request chain.
	return resolve(event);
};
