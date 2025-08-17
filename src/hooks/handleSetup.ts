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

// --- SETUP COMPLETION CHECK (RUNS ONCE AT STARTUP) ---

// This promise resolves to true if setup is complete, and false otherwise.
// It's evaluated once at startup and reused for subsequent requests for performance.
const setupCheckPromise = (async () => {
	if (building) return true; // During build assume setup is fine.

	try {
		const base = process.cwd();

		// 1) Fast marker check: prefer an explicit marker written at the end of setup.
		// This is the cheapest and most reliable signal for repeat restarts in prod.
		const markerCandidates = [Path.join(base, 'config', '.installed'), Path.join(base, '.svelty_installed')];
		if (markerCandidates.some((p) => existsSync(p))) {
			logger.info('✅ Setup marker found. Setup is complete.');
			return true;
		}

		// 2) Environment variables: many cloud deployments provide DB credentials via env.
		if (process.env.SVELTY_SETUP_DONE === 'true') {
			logger.info('✅ SVELTY_SETUP_DONE env var present. Setup is complete.');
			return true;
		}
		if (process.env.DB_HOST && process.env.DB_HOST.trim().length > 0) {
			logger.info('✅ DB_HOST present in environment. Setup is complete.');
			return true;
		}

		// 3) Fallback: look for config/private.* files (dev or built artifacts).
		const candidates = [
			Path.join(base, 'config', 'private.ts'),
			Path.join(base, 'config', 'private.js'),
			Path.join(base, 'config', 'private.cjs'),
			Path.join(base, 'config', 'private.mjs')
		];

		const foundPath = candidates.find((p) => existsSync(p));
		if (!foundPath) {
			logger.info('⚠️ Configuration file not found (config/private.*) and no marker/env present. Entering setup mode.');
			return false;
		}

		// Lightweight validation: inspect only the head of the file for DB_HOST to avoid
		// executing any config code and to keep startup fast.
		const raw = readFileSync(foundPath, 'utf8');
		const head = raw.slice(0, 32 * 1024); // first 32KB is usually enough

		// Match patterns like DB_HOST: 'value' or DB_HOST = "value" or DB_HOST: `value`
		const dbHostRegex = /DB_HOST\s*[:=]\s*['"`]\s*([^'"`\s]+)\s*['"`]/m;
		const match = head.match(dbHostRegex);
		if (match && match[1] && match[1].trim().length > 0) {
			logger.info(`✅ Configuration found (${Path.basename(foundPath)}). Setup is complete.`);
			return true;
		}

		logger.info('⚠️  Configuration file present but DB_HOST not set. Entering setup mode.');
		return false;
	} catch (err) {
		logger.error('⚠️ Error while checking configuration. Entering setup mode.', (err as Error).message);
		return false;
	}
})();

// --- THE SETUP HOOK ---

export const handleSetup: Handle = async ({ event, resolve }) => {
	// First check the cached startup result
	let isSetupComplete = await setupCheckPromise;

	// If startup check says setup is incomplete, also check the database
	// This handles the case where setup completed after server startup
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
			// If we can't check the database, fall back to the startup check
			logger.debug('Could not check database for setup status, using startup check', error);
		}
	}

	// If setup is complete, this hook does nothing and passes the request on.
	if (isSetupComplete) {
		// If setup is complete and user is trying to access setup routes, redirect to login
		const { pathname } = event.url;
		const setupRoutes = ['/setup', '/api/setup/status', '/api/setup/test-database', '/api/setup/complete'];
		const isSetupRoute = setupRoutes.some((p) => pathname.startsWith(p));

		if (isSetupRoute && pathname !== '/api/setup/status') {
			// Allow access to setup status API but redirect other setup routes
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
