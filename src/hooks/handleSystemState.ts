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
import { dbInitPromise } from '@src/databases/db';
import { isSetupComplete } from '@utils/setupCheck';

let initializationAttempted = false;

export const handleSystemState: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	let systemState = getSystemState();

	// Skip trace logging for static assets and health checks to reduce log noise
	const isHealthCheck = pathname.startsWith('/api/system/health') || pathname.startsWith('/api/dashboard/health');
	const isStaticAsset = pathname.startsWith('/static') || pathname.startsWith('/assets') || pathname.startsWith('/_');

	if (!isHealthCheck && !isStaticAsset) {
		logger.debug(`[handleSystemState] Request to \x1b[34m${pathname}\x1b[0m, system state: \x1b[32m${systemState.overallState}\x1b[0m`);
	}

	//  Setup Mode Detection - Prevents retry loops and eliminates 15+ second delay
	// If the system is IDLE, check if setup is complete before attempting initialization
	if (systemState.overallState === 'IDLE' && !initializationAttempted) {
		if (isSetupComplete()) {
			// Setup is complete - trigger normal initialization
			initializationAttempted = true;
			logger.info('System is \x1b[34mIDLE\x1b[0m and setup is complete. Awaiting initialization...');
			await dbInitPromise;
			systemState = getSystemState(); // Re-fetch state after initialization
			logger.info(`Initialization complete. System state is now: \x1b[34m${systemState.overallState}\x1b[0m`);
		} else {
			// Setup is NOT complete - skip initialization to prevent retry loops
			logger.info('System is \x1b[34mIDLE\x1b[0m and setup is not complete. Skipping DB initialization.');
			initializationAttempted = true;
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
			logger.trace(`Allowing request to \x1b[34m${pathname}\x1b[0m during \x1b[34mIDLE (setup mode)\x1b[0m state.`);
			return resolve(event);
		}
	}

	const isReady = isSystemReady(); // This should be true for 'READY' or 'DEGRADED' states

	// --- State: FAILED ---
	// If a critical service has failed, block all requests except health checks
	if (systemState.overallState === 'FAILED') {
		// Allow health checks and browser/tool requests even when system is FAILED
		const allowedPaths = ['/api/system/health', '/api/dashboard/health', '/.well-known', '/_'];
		const isAllowedRoute = allowedPaths.some((prefix) => pathname.startsWith(prefix));
		if (isAllowedRoute) {
			logger.trace(`Allowing health check/tool request to \x1b[34m${pathname}\x1b[0m despite FAILED state.`);
			return resolve(event);
		}

		const lastFailedTransition = systemState.performanceMetrics.stateTransitions
			.slice()
			.reverse()
			.find((t) => t.to === 'FAILED');
		logger.fatal(`Request blocked: System is in a FAILED state. Reason: ${lastFailedTransition?.reason || 'Unknown'}`);
		throw error(503, 'Service Unavailable: A critical system component has failed. Please contact an administrator.');
	}

	// --- State: INITIALIZING or IDLE ---
	// If the system is initializing, wait for it to complete (unless it's an allowed route)
	if (systemState.overallState === 'INITIALIZING') {
		const allowedPaths = ['/api/system/health', '/api/dashboard/health', '/setup', '/api/setup', '/login', '/.well-known', '/_'];
		const isAllowedRoute = allowedPaths.some((prefix) => pathname.startsWith(prefix)) || pathname === '/';

		if (isAllowedRoute) {
			logger.trace(`Allowing request to \x1b[34m${pathname}\x1b[0m during \x1b[34mINITIALIZING\x1b[0m state.`);
			return resolve(event);
		}

		// Wait for initialization to complete
		logger.debug(`Request to \x1b[34m${pathname}\x1b[0m waiting for initialization to complete...`);
		await dbInitPromise;
		systemState = getSystemState(); // Re-fetch state after initialization
		logger.debug(`Initialization complete. System state is now: \x1b[34m${systemState.overallState}\x1b[0m`);

		// If still not ready after initialization, block the request
		if (!isSystemReady()) {
			logger.warn(`Request to \x1b[34m${pathname}\x1b[0m blocked: System failed to initialize properly.`);
			throw error(503, 'Service Unavailable: The system failed to initialize. Please contact an administrator.');
		}

		// System is now ready, continue processing
	}

	// --- State: IDLE (Setup Mode) ---
	// If the system is not yet ready and not initializing, only allow essential requests to pass.
	if (!isReady) {
		const allowedPaths = ['/api/system/health', '/api/dashboard/health', '/setup', '/api/setup'];
		const isAllowedRoute = allowedPaths.some((prefix) => pathname.startsWith(prefix));

		if (isAllowedRoute) {
			logger.trace(`Allowing request to \x1b[34m${pathname}\x1b[0m during \x1b[34m${systemState.overallState}\x1b[0m state.`);
			return resolve(event);
		}

		// Reduce log noise for well-known/devtools requests
		if (pathname.startsWith('/.well-known/') || pathname.includes('devtools')) {
			logger.trace(`Request to \x1b[34m${pathname}\x1b[0m blocked: System is currently \x1b[34m${systemState.overallState}\x1b[0m.`);
		} else {
			logger.warn(`Request to \x1b[34m${pathname}\x1b[0m blocked: System is currently \x1b[34m${systemState.overallState}\x1b[0m.`);
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
