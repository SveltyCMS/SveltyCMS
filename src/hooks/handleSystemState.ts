/**
 * @file src/hooks/handleSystemState.ts
 * @description Middleware that acts as a gatekeeper, blocking or allowing requests based on the system's operational state.
 *
 * ### Features
 * - Integrates with the central state machine (`@stores/system`).
 * - Robust initialization with timeout protection
 * - Proper state machine with error recovery
 * - Prevents setup routes from returning before initialization
 */

import { error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { getSystemState, isSystemReady } from '@src/stores/system/state';
import { logger } from '@utils/logger.server';
import { dbInitPromise } from '@src/databases/db';
import { isSetupComplete } from '@utils/setupCheck';

// Track initialization state more robustly
let initializationState: 'pending' | 'in-progress' | 'complete' | 'failed' = 'pending';
let initError: Error | null = null;
let initStartTime: number = 0;

// Timeout protection (30 seconds max for initialization)
const INIT_TIMEOUT_MS = 30000;

export const handleSystemState: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const setupComplete = isSetupComplete();

	let systemState = getSystemState();

	// Skip trace logging for static assets and health checks to reduce log noise
	const isHealthCheck = pathname.startsWith('/api/system/health') || pathname.startsWith('/api/dashboard/health');
	const isStaticAsset = pathname.startsWith('/static') || pathname.startsWith('/assets') || pathname.startsWith('/_');

	if (!isHealthCheck && !isStaticAsset) {
		logger.debug(
			`[handleSystemState] ${event.request.method} ${pathname}${event.url.search} (Data: ${event.isDataRequest}), state: ${systemState.overallState}, initState: ${initializationState}`
		);
	}

	// ============================================================================
	// CRITICAL: Initialization MUST happen FIRST, before allowing any routes
	// ============================================================================

	// --- Phase 1: Attempt Initialization (if needed) ---
	if (systemState.overallState === 'IDLE') {
		if (initializationState === 'pending') {
			if (setupComplete) {
				// Start initialization
				initializationState = 'in-progress';
				initStartTime = Date.now();
				logger.info('System is IDLE and setup is complete. Starting initialization...');

				try {
					// Add timeout wrapper
					await Promise.race([
						dbInitPromise,
						new Promise((_, reject) => setTimeout(() => reject(new Error('Initialization timeout')), INIT_TIMEOUT_MS))
					]);

					systemState = getSystemState(); // Re-fetch state after init
					initializationState = 'complete';
					const duration = Date.now() - initStartTime;
					logger.info(`Initialization complete in ${duration}ms. System state: ${systemState.overallState}`);
				} catch (err) {
					initializationState = 'failed';
					initError = err instanceof Error ? err : new Error(String(err));
					logger.error('Initialization failed:', initError);
					throw error(503, 'Service initialization failed. Please check server logs.');
				}
			} else {
				// Setup not complete - skip initialization to prevent retry loops
				logger.info('System is IDLE and setup is not complete. Skipping DB initialization.');
				initializationState = 'complete';
			}
		} else if (initializationState === 'in-progress') {
			// Another request is already initializing, wait for it
			const elapsed = Date.now() - initStartTime;

			// Check if initialization is taking too long
			if (elapsed > INIT_TIMEOUT_MS) {
				initializationState = 'failed';
				initError = new Error(`Initialization exceeded timeout (${INIT_TIMEOUT_MS}ms)`);
				logger.error('Initialization timeout:', initError);
				throw error(503, 'Service initialization timed out. Please check server logs.');
			}

			logger.debug(`[handleSystemState] Request to ${pathname} waiting for ongoing initialization (${elapsed}ms elapsed)...`);
			try {
				await Promise.race([
					dbInitPromise,
					new Promise((_, reject) => setTimeout(() => reject(new Error('Initialization wait timeout')), INIT_TIMEOUT_MS - elapsed))
				]);
				systemState = getSystemState(); // Re-fetch state after wait
			} catch (err) {
				logger.error('Initialization wait failed:', err);
				throw error(503, 'Service initialization is taking longer than expected.');
			}
		} else if (initializationState === 'failed') {
			// Previous initialization failed, return error immediately
			logger.error('System initialization previously failed:', initError);
			throw error(503, `Service unavailable: ${initError?.message || 'Unknown initialization error'}`);
		}
		// If 'complete', continue to route checks below
	}

	// --- Phase 2: Allow Setup Routes (AFTER initialization attempt) ---
	if (systemState.overallState === 'IDLE') {
		const allowedPaths = [
			'/setup',
			'/api/setup',
			'/api/system/health',
			'/api/dashboard/health',
			'/login',
			'/static',
			'/assets',
			'/favicon.ico',
			'/.well-known',
			'/_',
			'/api/system/version',
			'/api/debug' // Allow debug endpoints
		];
		const isLocalizedSetup = /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/(setup|login|register)/.test(pathname);
		const isAllowedRoute = allowedPaths.some((prefix) => pathname.startsWith(prefix)) || pathname === '/' || isLocalizedSetup;

		if (isAllowedRoute) {
			logger.trace(`Allowing request to ${pathname} during IDLE (setup mode) state.`);
			return resolve(event);
		}
	}

	// --- State: INITIALIZING ---
	if (systemState.overallState === 'INITIALIZING') {
		const allowedPaths = [
			'/api/system/health',
			'/api/dashboard/health',
			'/setup',
			'/api/setup',
			'/login',
			'/.well-known',
			'/_',
			'/api/system/version',
			'/api/debug'
		];
		const isLocalizedSetup = /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/(setup|login|register)/.test(pathname);
		const isAllowedRoute = allowedPaths.some((prefix) => pathname.startsWith(prefix)) || (!setupComplete && pathname === '/') || isLocalizedSetup;

		if (isAllowedRoute) {
			logger.trace(`Allowing request to ${pathname} during INITIALIZING state.`);
			return resolve(event);
		}

		// Wait for initialization to complete with timeout
		logger.debug(`Request to ${pathname} waiting for initialization to complete...`);
		try {
			await Promise.race([dbInitPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('Init wait timeout')), INIT_TIMEOUT_MS))]);
			systemState = getSystemState();
			logger.debug(`Initialization complete. System state is now: ${systemState.overallState}`);
		} catch (err) {
			logger.error('Initialization wait error:', err);
			throw error(503, 'Service Unavailable: System initialization failed.');
		}

		// If still not ready after initialization, block the request
		if (!isSystemReady()) {
			logger.warn(`Request to ${pathname} blocked: System failed to initialize properly.`);
			throw error(503, 'Service Unavailable: The system failed to initialize. Please contact an administrator.');
		}
	}

	// --- State: Final Ready Check ---
	const isNowReady = systemState.overallState === 'READY' || systemState.overallState === 'DEGRADED';
	if (!isNowReady) {
		const allowedPaths = ['/api/system/health', '/api/dashboard/health', '/setup', '/api/setup', '/api/system/version', '/api/debug'];
		const isAllowedRoute = allowedPaths.some((prefix) => pathname.startsWith(prefix));

		if (isAllowedRoute) {
			logger.trace(`Allowing request to ${pathname} during ${systemState.overallState} state.`);
			return resolve(event);
		}

		// Reduce log noise for well-known/devtools requests
		if (pathname.startsWith('/.well-known/') || pathname.includes('devtools')) {
			logger.trace(`Request to ${pathname} blocked: System is currently ${systemState.overallState}.`);
		} else {
			logger.warn(`Request to ${pathname} blocked: System is currently ${systemState.overallState}.`);
		}
		throw error(503, 'Service Unavailable: The system is starting up. Please try again in a moment.');
	}

	// --- State: READY or DEGRADED ---
	if (systemState.overallState === 'DEGRADED') {
		const degradedServices = Object.entries(systemState.services)
			.filter(([, s]) => s.status === 'unhealthy')
			.map(([name]) => name);

		if (degradedServices.length > 0) {
			event.locals.degradedServices = degradedServices;
			logger.warn(`Request to ${pathname} is proceeding in a DEGRADED state. Unhealthy services: ${degradedServices.join(', ')}`);
		}
	}

	return resolve(event);
};
