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
import { logger } from '@utils/logger.svelte';
import { dbInitPromise } from '@src/databases/db';

let initializationAttempted = false;

export const handleSystemState: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	let systemState = getSystemState();
	logger.debug(`[handleSystemState] Request to \x1b[34m${pathname}\x1b[0m, system state: \x1b[32m${systemState.overallState}\x1b[0m`);

	// If the system is IDLE, it means initialization hasn't been triggered yet on the request lifecycle.
	// This ensures that we wait for the server's startup initialization to complete.
	if (systemState.overallState === 'IDLE' && !initializationAttempted) {
		initializationAttempted = true;
		logger.info('System is \x1b[34mIDLE\x1b[0m on first request, awaiting initialization...');
		await dbInitPromise;
		systemState = getSystemState(); // Re-fetch state after initialization has run
		logger.info(`Initialization check complete. System state is now: \x1b[34m${systemState.overallState}\x1b[0m`);
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
	// If the system is not yet ready, only allow essential requests to pass.
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
	return resolve(event);
};
