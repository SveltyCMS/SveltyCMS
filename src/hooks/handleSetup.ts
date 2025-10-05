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

import { isSetupComplete, isSetupCompleteAsync } from '@utils/setupCheck';

// Regex to quickly identify asset requests that should always be allowed.
const ASSET_REGEX = /^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|favicon\.ico|.*\.(svg|png|jpg|jpeg|gif|css|js))/;

export const handleSetup: Handle = async ({ event, resolve }) => {
	// Check setup status dynamically (sync check for config file)
	const configExists = isSetupComplete();

	// --- Branch 1: Config file doesn't exist or is empty ---
	if (!configExists) {
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

	// --- Branch 2: Config exists, validate database has users ---

	// Initialize database connection first, before checking for users
	try {
		const { initializeOnRequest, getSystemStatus } = await import('@src/databases/db');
		const status = getSystemStatus();

		if (!status.initialized && !status.initializing) {
			await initializeOnRequest();
		}
	} catch (error) {
		logger.error('Failed to initialize database system during setup check:', error);
		// If database initialization fails, redirect to setup
		if (event.url.pathname.startsWith('/setup') || event.url.pathname.startsWith('/api/setup') || ASSET_REGEX.test(event.url.pathname)) {
			return resolve(event, {
				filterSerializedResponseHeaders: (name) => {
					const lower = name.toLowerCase();
					return lower.startsWith('content-') || lower.startsWith('etag') || lower === 'set-cookie';
				}
			});
		}
		throw redirect(302, '/setup');
	}

	// Now check if database has users
	const isFullySetup = await isSetupCompleteAsync();

	if (!isFullySetup) {
		logger.warn('Config exists but database is empty or has no users. Redirecting to setup...');

		// Allow setup routes
		if (event.url.pathname.startsWith('/setup') || event.url.pathname.startsWith('/api/setup') || ASSET_REGEX.test(event.url.pathname)) {
			return resolve(event, {
				filterSerializedResponseHeaders: (name) => {
					const lower = name.toLowerCase();
					return lower.startsWith('content-') || lower.startsWith('etag') || lower === 'set-cookie';
				}
			});
		}

		throw redirect(302, '/setup');
	}

	// --- Branch 3: Setup IS complete ---

	// Prevent access to the setup page UI after completion.
	if (event.url.pathname.startsWith('/setup') && !event.url.pathname.startsWith('/api/setup')) {
		throw redirect(302, '/login');
	}

	// Database is already initialized above

	// Proceed with the request chain.
	return resolve(event);
};
