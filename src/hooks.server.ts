/**
 * @file src/hooks.server.ts
 * @description Hook middleware pipeline with unified metrics and automated security response
 *
 * This file orchestrates a streamlined sequence of middleware to handle
 * all incoming server requests. The architecture emphasizes security, observability,
 * and performance with unified metrics collection and automated threat detection.
 *
 * Middleware Sequence:
 * 1. System state validation (gatekeeper)
 * 2. Setup completion enforcement (installation gate)
 * 3. CSP nonce generation (XSS prevention)
 * 4. Authentication & session management (identity)
 * 5. Authorization & access control (security)
 * 6. Security headers with nonce-based CSP (defense in depth)
 *
 * Core Services:
 * - MetricsService: Unified performance & security monitoring
 * - SecurityResponseService: Automated threat detection & response
 */

import { building } from '$app/environment';
import { type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { logger } from '@utils/logger.svelte';
import { metricsService } from '@src/services/MetricsService';

// --- Import enterprise middleware hooks ---
import { handleSystemState } from './hooks/handleSystemState';
import { handleSetup } from './hooks/handleSetup';
import { handleAuthentication } from './hooks/handleAuthentication';
import { handleAuthorization } from './hooks/handleAuthorization';
import { addSecurityHeaders } from './hooks/addSecurityHeaders';

// --- Performance Monitoring Utilities ---

// --- Enterprise Middleware Pipeline ---

// --- Unified Metrics Service ---
// All metrics are now handled by the centralized MetricsService
// This eliminates duplicate metrics systems and provides enterprise-grade monitoring

// --- Middleware Sequence ---

/**
 * Simplified enterprise middleware pipeline with SvelteKit's built-in CSP.
 * Each hook integrates with MetricsService for comprehensive monitoring.
 */
const middleware: Handle[] = [
	// 1. System state validation (enterprise gatekeeper with metrics)
	handleSystemState,

	// 2. Setup completion enforcement (installation gate with tracking)
	handleSetup,

	// 3. Authentication & session management (with security monitoring)
	handleAuthentication,

	// 4. Authorization & access control (with threat detection)
	handleAuthorization,

	// 5. Essential security headers (SvelteKit handles CSP automatically)
	addSecurityHeaders
];

// --- Main Handle Export ---

/**
 * The main handle function orchestrates all middleware in sequence.
 * Each middleware hook processes the request in order and can:
 * - Modify event.locals
 * - Throw errors or redirects
 * - Return early with a response
 * - Call resolve() to continue to the next hook
 */
export const handle: Handle = sequence(...middleware);

// --- Utility Functions for External Use ---

/**
 * Returns a comprehensive metrics report from the unified metrics service.
 * Provides enterprise-grade monitoring data across all middleware.
 */
export const getHealthMetrics = () => metricsService.getReport();

/**
 * Invalidates a specific user's session from all cache layers.
 * Useful when logging out a user or revoking their session.
 */
export { invalidateSessionCache } from './hooks/handleAuthentication';

// --- Server Startup Logic ---

if (!building) {
	/**
	 * The main initialization logic (settings, DB connection) is handled
	 * in `src/databases/db.ts` to ensure it runs once on server start.
	 *
	 * The system will transition through these states:
	 * IDLE -> INITIALIZING -> READY (or DEGRADED/FAILED)
	 *
	 * The handleSystemState hook will block requests appropriately
	 * based on the current state.
	 */
	import('@src/databases/db')
		.then(() => {
			logger.info('✅ DB module loaded. System will initialize on first request via handleSystemState.');
		})
		.catch((error) => {
			logger.error('Fatal: Failed to load DB module during server startup:', error);
		});
}
