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
 * 3. Language preferences (i18n cookie synchronization)
 * 4. Theme management (SSR dark mode support)
 * 5. Authentication & session management (identity)
 * 6. Authorization & access control (security)
 * 7. Security headers with nonce-based CSP (defense in depth)
 *
 * Core Services:
 * - MetricsService: Unified performance & security monitoring
 * - SecurityResponseService: Automated threat detection & response
 *
 * Utility Exports:
 * - getHealthMetrics(): Returns comprehensive metrics report
 * - invalidateSessionCache(): Invalidates specific user session
 * - clearAllSessionCaches(): Clears all cached sessions
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
import { handleLocale } from './hooks/handleLocale';
import { handleTheme } from './hooks/handleTheme';
import { addSecurityHeaders } from './hooks/addSecurityHeaders';

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

// --- Middleware Sequence ---
const middleware: Handle[] = [
	// 1. System state validation (enterprise gatekeeper with metrics)
	handleSystemState,

	// 2. Setup completion enforcement (redirects to standalone setup-wizard app if needed)
	handleSetup,

	// 3. Language preferences (i18n)
	handleLocale,

	// 4. Theme management
	handleTheme,

	// 5. Authentication & session management (with security monitoring)
	handleAuthentication,

	// 6. Authorization & access control (with threat detection)
	handleAuthorization,

	// 7. Essential security headers (SvelteKit handles CSP automatically)
	addSecurityHeaders
];

// --- Main Handle Export ---
export const handle: Handle = sequence(...middleware);

// --- Utility Functions for External Use ---
export const getHealthMetrics = () => metricsService.getReport();
export { invalidateSessionCache, clearAllSessionCaches } from './hooks/handleAuthentication';
