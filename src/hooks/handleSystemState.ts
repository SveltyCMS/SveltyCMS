/**
 * @file src/hooks/handleSystemState.ts
 * @description Middleware that acts as a gatekeeper, blocking or allowing requests based on the system's operational state.
 *
 * ### Features
 * - Integrates with the central state machine (`@stores/system`).
 * - Blocks all requests with a 503 error if the system is in a FAILED state.
 * - Allows only essential routes (setup, health checks) to pass during INITIALIZING or IDLE states.
 * - Returns a 503 error for all other requests if the system is not yet ready.
 * - Allows requests to proceed when the system is READY or DEGRADED.
 */

import { error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { getSystemState, isSystemReady } from '@src/stores/system'; // Import from your state machine
import { logger } from '@utils/logger.server';
import { dbInitPromise, dbAdapter } from '@src/databases/db';
import { isSetupComplete } from '@utils/setupCheck';

let initializationAttempted = false;

export const handleSystemState: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const setupComplete = isSetupComplete();

	// Debug: Log TEST_MODE value
	// if (!pathname.startsWith('/static') && !pathname.startsWith('/assets')) {
	// 	logger.debug(`[handleSystemState] TEST_MODE=${process.env.TEST_MODE}, pathname=${pathname}`);
	// }

	let systemState = getSystemState();

	// Skip trace logging for static assets and health checks to reduce log noise
	const isHealthCheck = pathname.startsWith('/api/system/health') || pathname.startsWith('/api/dashboard/health');
	const isStaticAsset = pathname.startsWith('/static') || pathname.startsWith('/assets') || pathname.startsWith('/_');

	if (!isHealthCheck && !isStaticAsset) {
		logger.debug(`[handleSystemState] Request to ${pathname}, system state: ${systemState.overallState}`);
	}

	// Setup Mode Detection - Prevents retry loops and eliminates 15+ second delay
	// If the system is IDLE, check if setup is complete before attempting initialization
	if (systemState.overallState === 'IDLE') {
		if (!initializationAttempted) {
			if (setupComplete) {
				// Setup is complete - trigger normal initialization
				initializationAttempted = true;
				logger.info('System is IDLE and setup is complete. Awaiting initialization...');
				await dbInitPromise;
				systemState = getSystemState(); // Re-fetch state after initialization
				logger.info(`Initialization complete. System state is now: ${systemState.overallState}`);
			} else {
				// Setup is NOT complete - skip initialization to prevent retry loops
				logger.info('System is IDLE and setup is not complete. Skipping DB initialization.');
				initializationAttempted = true;
			}
		} else {
			// Race condition handling: Initialization was triggered by another request but state hasn't updated yet
			// or we are waiting for it to complete.
			logger.debug(`[handleSystemState] Request to ${pathname} hit IDLE state with initialization in progress. Waiting...`);
			await dbInitPromise;
			systemState = getSystemState();
		}
	}

	// Allow setup wizard and static assets during first-time setup (IDLE state)
	if (systemState.overallState === 'IDLE') {
		const allowedPaths = [
			'/setup',
			'/api/setup',
			'/api/system/health',
			'/api/dashboard/health',
			'/login', // Allow login page (will redirect to setup if needed)
			'/static',
			'/assets',
			'/favicon.ico',
			'/.well-known',
			'/_'
		];
		const isAllowedRoute = allowedPaths.some((prefix) => pathname.startsWith(prefix)) || pathname === '/';
		if (isAllowedRoute) {
			logger.trace(`Allowing request to ${pathname} during IDLE (setup mode) state.`);
			return resolve(event);
		}
	}

	// --- State: INITIALIZING ---
	// If the system is initializing, wait for it to complete (unless it's an allowed route)
	if (systemState.overallState === 'INITIALIZING') {
		const allowedPaths = ['/api/system/health', '/api/dashboard/health', '/setup', '/api/setup', '/login', '/.well-known', '/_'];
		// Allow / only if we are in setup mode (no config). If config exists, wait for init.
		const isAllowedRoute = allowedPaths.some((prefix) => pathname.startsWith(prefix)) || (!setupComplete && pathname === '/');

		if (isAllowedRoute) {
			logger.trace(`Allowing request to ${pathname} during INITIALIZING state.`);
			return resolve(event);
		}

		// Wait for initialization to complete
		logger.debug(`Request to ${pathname} waiting for initialization to complete...`);
		await dbInitPromise;
		systemState = getSystemState(); // Re-fetch state after initialization
		logger.debug(`Initialization complete. System state is now: ${systemState.overallState}`);

		// If still not ready after initialization, block the request
		if (!isSystemReady()) {
			logger.warn(`Request to ${pathname} blocked: System failed to initialize properly.`);
			throw error(503, 'Service Unavailable: The system failed to initialize. Please contact an administrator.');
		}

		// System is now ready, continue processing
	}

	// --- State: IDLE (Setup Mode) / Final Check ---
	// If the system is not yet ready and not initializing, only allow essential requests to pass.
	// Checks against the LATEST systemState (which may have been updated above)
	const isNowReady = systemState.overallState === 'READY' || systemState.overallState === 'DEGRADED';
	if (!isNowReady) {
		const allowedPaths = ['/api/system/health', '/api/dashboard/health', '/setup', '/api/setup'];
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
	// If the system is operational, let the request proceed to the next hook.

	// If the system is in a DEGRADED state, attach info about which services are down.
	if (systemState.overallState === 'DEGRADED') {
		const degradedServices = Object.entries(systemState.services)
			.filter(([, s]) => s.status === 'unhealthy')
			.map(([name]) => name);

		if (degradedServices.length > 0) {
			event.locals.degradedServices = degradedServices;
			// metricsService.increment('degradedRequests'); // For measurement - TODO: implement this method
			logger.warn(`Request to ${pathname} is proceeding in a DEGRADED state. Unhealthy services: ${degradedServices.join(', ')}`);
		}
	}

	return resolve(event);
};
