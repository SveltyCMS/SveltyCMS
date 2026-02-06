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
import type { SystemState } from '@src/stores/system/types';
import { logger } from '@utils/logger.server';
import { dbInitPromise } from '@src/databases/db';
import { isSetupComplete } from '@utils/setupCheck';
import { AppError, handleApiError } from '@utils/errorHandling';

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

	// Bypass state checks in TEST_MODE to prevent blocking tests on transient failures
	if (process.env.TEST_MODE === 'true') {
		if (!isHealthCheck && !isStaticAsset) {
			logger.warn(`[handleSystemState] TEST_MODE enabled. Bypassing state checks for ${pathname}`);
		}
		return await resolve(event);
	}

	try {
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
						throw new AppError('Service initialization failed. Please check server logs.', 503, 'INIT_FAILED');
					}
				} else {
					// Setup not complete - skip initialization to prevent retry loops
					if ((initializationState as string) !== 'complete') {
						logger.info('System is IDLE and setup is not complete. Skipping DB initialization.');
						initializationState = 'complete';
					}
				}
			} else if (initializationState === 'complete' && setupComplete) {
				// EDGE CASE: Setup completed recently, but previous request skipped init.
				// We must force restart initialization!
				logger.info('System is IDLE, init was skipped, but Setup is now COMPLETE. Restarting initialization...');
				initializationState = 'in-progress';
				initStartTime = Date.now();

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
					throw new AppError('Service initialization failed. Please check server logs.', 503, 'INIT_FAILED');
				}
			} else if (initializationState === 'in-progress') {
				// Another request is already initializing, wait for it
				const elapsed = Date.now() - initStartTime;

				// Check if initialization is taking too long
				if (elapsed > INIT_TIMEOUT_MS) {
					initializationState = 'failed';
					initError = new Error(`Initialization exceeded timeout (${INIT_TIMEOUT_MS}ms)`);
					logger.error('Initialization timeout:', initError);
					throw new AppError('Service initialization timed out. Please check server logs.', 503, 'INIT_TIMEOUT');
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
					throw new AppError('Service initialization is taking longer than expected.', 503, 'INIT_WAIT_TIMEOUT');
				}
			} else if (initializationState === 'failed') {
				// Self-Healing: Check if we should retry initialization
				const RETRY_COOLDOWN_MS = 5000; // Retry every 5 seconds
				const timeSinceFailure = Date.now() - (initStartTime || 0);

				if (timeSinceFailure > RETRY_COOLDOWN_MS) {
					logger.info(`[Self-Healing] Attempting to recover from previous initialization failure (failed ${timeSinceFailure}ms ago)...`);
					initializationState = 'in-progress'; // Take lock immediately
					initStartTime = Date.now();

					try {
						logger.info('[Self-Healing] Restarting initialization sequence...');
						const { resetDbInitPromise } = await import('@src/databases/db');
						await resetDbInitPromise();

						const { dbInitPromise: newPromise } = await import('@src/databases/db');

						await Promise.race([
							newPromise,
							new Promise((_, reject) => setTimeout(() => reject(new Error('Recovery initialization timeout')), INIT_TIMEOUT_MS))
						]);

						systemState = getSystemState();
						initializationState = 'complete';
						logger.info(`[Self-Healing] System successfully recovered! State: ${systemState.overallState}`);
					} catch (recoveryErr) {
						initializationState = 'failed';
						initError = recoveryErr instanceof Error ? recoveryErr : new Error(String(recoveryErr));
						logger.error('[Self-Healing] Recovery failed:', initError);
						throw new AppError('Service Unavailable: System recovery failed. Retrying in 5s...', 503, 'RECOVERY_FAILED');
					}
				} else {
					// Cooldown active
					logger.warn(
						`System initialization failed. Cooldown active (${RETRY_COOLDOWN_MS - timeSinceFailure}ms remaining). Error: ${initError?.message}`
					);
					throw new AppError(
						`Service Unavailable: System starting up... (${Math.ceil((RETRY_COOLDOWN_MS - timeSinceFailure) / 1000)}s)`,
						503,
						'INIT_COOLDOWN'
					);
				}
			}
			// If 'complete', continue to route checks below
		}

		// --- Phase 2: Allow Setup Routes (AFTER initialization attempt) ---
		if (systemState.overallState === 'IDLE') {
			const allowedPaths = [
				'/setup',
				'/api/system/health',
				'/api/dashboard/health',
				'/login',
				'/static',
				'/assets',
				'/favicon.ico',
				'/.well-known',
				'/_',
				'/api/system/version',
				'/api/system', // Allow unified system API
				'/api/debug', // Allow debug endpoints
				'/api/settings/public' // ✨ Allow public settings for setup UI
			];
			const isLocalizedSetup = /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/(setup|login|register)/.test(pathname);
			const isAllowedRoute = allowedPaths.some((prefix) => pathname.startsWith(prefix)) || pathname === '/' || isLocalizedSetup;

			if (isAllowedRoute) {
				logger.trace(`Allowing request to ${pathname} during IDLE (setup mode) state.`);
				return await resolve(event);
			}
		}

		// --- State: INITIALIZING ---
		if (systemState.overallState === 'INITIALIZING') {
			const allowedPaths = [
				'/api/system/health',
				'/api/dashboard/health',
				'/setup',
				'/login',
				'/.well-known',
				'/_',
				'/api/system/version',
				'/api/system', // Allow unified system API during initialization
				'/api/debug'
			];
			const isLocalizedSetup = /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/(setup|login|register)/.test(pathname);
			const isAllowedRoute = allowedPaths.some((prefix) => pathname.startsWith(prefix)) || (!setupComplete && pathname === '/') || isLocalizedSetup;

			if (isAllowedRoute) {
				logger.trace(`Allowing request to ${pathname} during INITIALIZING state.`);
				return await resolve(event);
			}

			// Wait for initialization to complete with timeout
			logger.debug(`Request to ${pathname} waiting for initialization to complete...`);
			try {
				await Promise.race([dbInitPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('Init wait timeout')), INIT_TIMEOUT_MS))]);
				systemState = getSystemState();
				logger.debug(`Initialization complete. System state is now: ${systemState.overallState}`);
			} catch (err) {
				logger.error('Initialization wait error:', err);
				throw new AppError('Service Unavailable: System initialization failed.', 503, 'INIT_FAILED_WAIT');
			}

			// If still not ready after initialization, block the request
			if (!isSystemReady()) {
				logger.warn(`Request to ${pathname} blocked: System failed to initialize properly.`);
				throw new AppError('Service Unavailable: The system failed to initialize. Please contact an administrator.', 503, 'SYSTEM_NOT_READY');
			}
		}

		// --- State: SETUP ---
		if (systemState.overallState === 'SETUP') {
			const allowedPaths = ['/setup', '/api/system', '/login', '/static', '/assets', '/.well-known', '/_', '/api/debug'];
			const isLocalizedSetup = /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/(setup|login|register)/.test(pathname);
			const isAllowedRoute = allowedPaths.some((prefix) => pathname.startsWith(prefix)) || pathname === '/' || isLocalizedSetup;

			if (isAllowedRoute) {
				// If root is requested in SETUP mode, redirect to setup wizard
				if (pathname === '/') {
					logger.info('System in SETUP mode. Redirecting root to /setup');
					return new Response(null, { status: 302, headers: { Location: '/setup' } });
				}
				logger.trace(`Allowing request to ${pathname} during SETUP state.`);
				return await resolve(event);
			}

			logger.warn(`Request to ${pathname} blocked: System is in SETUP mode.`);
			throw new AppError('System is in Setup Mode. Please complete configuration.', 503, 'SYSTEM_SETUP_MODE');
		}

		// --- State: MAINTENANCE ---
		if (systemState.overallState === 'MAINTENANCE') {
			// Allow health checks and admin login
			const allowedPaths = ['/api/system/health', '/api/dashboard/health', '/login', '/api/auth/login'];
			if (allowedPaths.some((prefix) => pathname.startsWith(prefix))) {
				return await resolve(event);
			}

			logger.warn(`Request to ${pathname} blocked: System is in MAINTENANCE mode.`);
			throw new AppError('System is currently under maintenance. Please try again later.', 503, 'SYSTEM_MAINTENANCE');
		}

		// --- State: Final Ready Check ---
		const isNowReady =
			systemState.overallState === 'READY' ||
			systemState.overallState === 'DEGRADED' ||
			systemState.overallState === 'WARMING' ||
			systemState.overallState === 'WARMED' ||
			(systemState.overallState as SystemState) === 'SETUP';
		if (!isNowReady) {
			const allowedPaths = ['/api/system/health', '/api/dashboard/health', '/setup', '/api/system/version', '/api/system', '/api/debug'];
			const isAllowedRoute = allowedPaths.some((prefix) => pathname.startsWith(prefix));

			if (isAllowedRoute) {
				logger.trace(`Allowing request to ${pathname} during ${systemState.overallState} state.`);
				return await resolve(event);
			}

			// Reduce log noise for well-known/devtools requests
			if (pathname.startsWith('/.well-known/') || pathname.includes('devtools')) {
				logger.trace(`Request to ${pathname} blocked: System is currently ${systemState.overallState}.`);
			} else {
				logger.warn(`Request to ${pathname} blocked: System is currently ${systemState.overallState}.`);
			}
			throw new AppError('Service Unavailable: The system is starting up. Please try again in a moment.', 503, 'SYSTEM_STARTING_UP');
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

		return await resolve(event);
	} catch (err) {
		if (pathname.startsWith('/api/')) {
			return handleApiError(err, event);
		}

		if (err instanceof AppError) {
			throw error(err.status, err.message);
		}

		throw err;
	}
};
