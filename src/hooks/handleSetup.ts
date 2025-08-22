/**
 * @file src/hooks/handleSetup.ts
 * @description Middleware to manage the initial application setup process.
 *
 * @summary This hook checks for a valid 'config/private.ts' file once on server startup.
 * If the configuration is missing, it intercepts all incoming requests and redirects
 * them to the '/setup' page, ensuring the application cannot be used until installed.
 */

import { building } from '$app/environment';
import { redirect, type Handle } from '@sveltejs/kit';
import { existsSync, readFileSync } from 'fs';
import Path from 'path';

// System Logger
import { logger } from '@utils/logger.svelte';

// --- SETUP COMPLETION CHECK (RUNS ON EVERY REQUEST) ---

// Note: Setup completion is now checked on every request to handle dynamic setup completion
// without requiring server restart. This provides better UX during development.

// --- THE SETUP HOOK ---

export const handleSetup: Handle = async ({ event, resolve }) => {
	// Check for setup completion on every request to handle dynamic setup completion
	let isSetupComplete = false;

	try {
		const base = process.cwd();

		// 1) Fast marker check: prefer an explicit marker written at the end of setup.
		// This is the cheapest and most reliable signal for repeat restarts in prod.
		const markerCandidates = [Path.join(base, 'config', '.installed'), Path.join(base, '.svelty_installed')];
		if (markerCandidates.some((p) => existsSync(p))) {
			logger.debug('✅ Setup marker found. Setup is complete.');
			isSetupComplete = true;
		}

		// 2) Environment variables: many cloud deployments provide DB credentials via env.
		if (!isSetupComplete && process.env.SVELTY_SETUP_DONE === 'true') {
			logger.debug('✅ SVELTY_SETUP_DONE env var present. Setup is complete.');
			isSetupComplete = true;
		}
		if (!isSetupComplete && process.env.DB_HOST && process.env.DB_HOST.trim().length > 0) {
			logger.debug('✅ DB_HOST present in environment. Setup is complete.');
			isSetupComplete = true;
		}

		// 3) Fallback: look for config/private.* files (dev or built artifacts).
		if (!isSetupComplete) {
			const candidates = [
				Path.join(base, 'config', 'private.ts'),
				Path.join(base, 'config', 'private.js'),
				Path.join(base, 'config', 'private.cjs'),
				Path.join(base, 'config', 'private.mjs')
			];

			const foundPath = candidates.find((p) => existsSync(p));
			if (foundPath) {
				// Lightweight validation: inspect only the head of the file for DB_HOST to avoid
				// executing any config code and to keep startup fast.
				const raw = readFileSync(foundPath, 'utf8');
				const head = raw.slice(0, 32 * 1024); // first 32KB is usually enough

				// Match patterns like DB_HOST: 'value' or DB_HOST = "value" or DB_HOST: `value`
				const dbHostRegex = /DB_HOST\s*[:=]\s*['"`]\s*([^'"`\s]+)\s*['"`]/m;
				const match = head.match(dbHostRegex);
				if (match && match[1] && match[1].trim().length > 0) {
					logger.debug(`✅ Configuration found (${Path.basename(foundPath)}). Setup is complete.`);
					isSetupComplete = true;
				}
			}
		}

		// 4) Check database for setup completion (if file checks didn't work)
		if (!isSetupComplete) {
			try {
				// Check if we can access the configuration service
				const { config } = await import('@src/lib/config.server');

				// If config service is initialized, check if setup is completed in database
				if (config.isInitialized() && !config.isSetupMode()) {
					const setupCompleted = await config.getPublic('SETUP_COMPLETED');
					if (setupCompleted) {
						logger.info('✅ Setup completed detected in database. Allowing access.');
						isSetupComplete = true;
					}
				}
			} catch (error) {
				// If we can't check the database, continue with file-based checks
				logger.debug('Could not check database for setup status, continuing with file checks', error);
			}
		}
	} catch (err) {
		logger.error('⚠️ Error while checking configuration. Entering setup mode.', (err as Error).message);
		isSetupComplete = false;
	}

	// If setup is complete, this hook does nothing and passes the request on.
	if (isSetupComplete) {
		// --- Ensure authentication system is re-initialized after setup ---
		try {
			const { clearPrivateConfigCache } = await import('@src/databases/db');
			clearPrivateConfigCache();
			// Optionally, trigger adapter reload if available
			if (typeof globalThis.reloadAdapters === 'function') {
				await globalThis.reloadAdapters();
			}
		} catch (err) {
			logger.warn('Could not clear private config cache or reload adapters after setup:', err);
		}
		// If setup is complete and user is trying to access setup routes, redirect to login
		const { pathname } = event.url;
		const setupRoutes = ['/setup', '/api/setup/status', '/api/setup/test-database', '/api/setup/complete'];
		const isSetupRoute = setupRoutes.some((p) => pathname.startsWith(p));

		if (isSetupRoute && pathname !== '/api/setup/status' && pathname !== '/api/setup/complete') {
			// Allow access to setup status API and complete API but redirect other setup routes
			throw redirect(302, '/login');
		}

		return resolve(event);
	}

	const { pathname } = event.url;

	// Define all routes that are allowed to be accessed during setup mode.
	const allowedPaths = ['/setup', '/api/setup/status', '/api/setup/test-database', '/api/setup/complete', '/api/setup/status/'];
	const isSetupRoute = allowedPaths.some((p) => pathname.startsWith(p));

	// Also allow SvelteKit's internal assets and the favicon.
	const isStaticAsset = pathname.startsWith('/_app/') || pathname.includes('favicon');

	// If the request is for an allowed route, let it proceed.
	if (isSetupRoute || isStaticAsset) {
		return resolve(event);
	}

	// For any other route, forcefully redirect the user to the setup page.
	throw redirect(307, '/setup'); // 307 (Temporary Redirect) is appropriate here.
};
