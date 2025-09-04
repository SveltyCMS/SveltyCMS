/**
 * @file src/hooks/handleSetup.ts
 * @description Middleware to manage the initial application setup process.
 *
 * @summary This hook checks for setup completion using a centralized utility.
 * If setup is not complete, it intercepts all incoming requests and redirects
 * them to the '/setup' page, ensuring the application cannot be used until installed.
 */

import { redirect, type Handle } from '@sveltejs/kit';
import { isSetupComplete } from '@utils/setupCheck';

// System Logger
import { logger } from '@utils/logger.svelte';

export const handleSetup: Handle = async ({ event, resolve }) => {
	// Check for setup completion using centralized utility
	const setupComplete = isSetupComplete();

	// If setup is not complete, redirect to setup page (except for setup-related routes)
	if (!setupComplete) {
		// Allow setup routes to pass through
		if (event.url.pathname.startsWith('/setup') || event.url.pathname.startsWith('/api/setup')) {
			return resolve(event);
		}

		// Allow static assets to pass through
		if (
			event.url.pathname.startsWith('/static') ||
			event.url.pathname.startsWith('/_app') ||
			event.url.pathname.endsWith('.ico') ||
			event.url.pathname.endsWith('.png') ||
			event.url.pathname.endsWith('.svg') ||
			event.url.pathname.endsWith('.css') ||
			event.url.pathname.endsWith('.js')
		) {
			return resolve(event);
		}

		// Redirect to setup page
		logger.debug(`Setup not complete, redirecting ${event.url.pathname} to /setup`);
		throw redirect(302, '/setup');
	}

	// Setup is complete - prevent access to setup routes (except API endpoints)
	if (event.url.pathname.startsWith('/setup') && !event.url.pathname.startsWith('/api/setup')) {
		logger.debug(`Setup complete, redirecting ${event.url.pathname} to /login`);
		throw redirect(302, '/login');
	}

	// Setup is complete, continue with normal request processing
	// Initialize the database system on first non-setup request
	try {
		const { initializeOnRequest, getSystemStatus } = await import('@src/databases/db');
		const status = getSystemStatus();

		if (!status.initialized && !status.initializing) {
			logger.debug('Triggering database initialization after setup completion');
			await initializeOnRequest();
		}
	} catch (error) {
		logger.error('Failed to initialize database system:', error);
		// Continue with request processing even if initialization fails
	}

	return resolve(event);
};
