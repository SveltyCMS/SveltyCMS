/**
 * @file src/hooks.server.ts
 * @description Hook middleware pipeline with unified metrics and automated security response
 *
 * This file orchestrates a streamlined sequence of middleware to handle
 * all incoming server requests. The architecture emphasizes security, observability,
 * and performance with unified metrics collection and automated threat detection.
 *
 * Middleware Sequence:
 * 1. Static asset caching (performance optimization, skip all processing)
 * 2. System state validation (gatekeeper)
 * 3. Rate limiting (abuse prevention)
 * 4. Application firewall (threat detection)
 * 5. Setup completion enforcement (installation gate)
 * 6. Language preferences (i18n cookie synchronization)
 * 7. Theme management (SSR dark mode support)
 * 8. Authentication & session management (identity)
 * 9. Authorization & access control (security)
 * 10. API request handling (optional, commented out by default)
 * 11. Security headers with nonce-based CSP (defense in depth)
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
import { logger } from '@utils/logger.server';
import { metricsService } from '@src/services/MetricsService';

// --- Import enterprise middleware hooks ---
import { handleSystemState } from './hooks/handleSystemState';
import { handleSetup } from './hooks/handleSetup';
import { handleAuthentication } from './hooks/handleAuthentication';
import { handleAuthorization } from './hooks/handleAuthorization';
import { handleLocale } from './hooks/handleLocale';
import { handleTheme } from './hooks/handleTheme';
import { addSecurityHeaders } from './hooks/addSecurityHeaders';
import { handleTokenResolution } from './hooks/tokenResolution';
import { handleStaticAssetCaching } from './hooks/handleStaticAssetCaching';
import { handleRateLimit } from './hooks/handleRateLimit';
import { handleFirewall } from './hooks/handleFirewall';
// API middleware for role-based access control and caching
import { handleApiRequests } from './hooks/handleApiRequests';
import { handleCompression } from './hooks/handleCompression';

// --- Import Token Services for Dependency Injection ---
import { TokenRegistry } from '@src/services/token/engine';
import { getRelationTokens } from '@src/services/token/relationEngine';

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
	// Static import ensures the module is loaded and initialization promise is created
	import('@src/databases/db');

	// Inject server-side relation engine into TokenRegistry
	TokenRegistry.setRelationTokenGenerator(getRelationTokens);

	logger.info('✅ DB module loaded. System will initialize on first request via handleSystemState.');
}

// --- Middleware Sequence ---
const middleware: Handle[] = [
	// 1. Static assets FIRST (skip all other processing for maximum performance)
	handleStaticAssetCaching,

	// 2. System state validation (enterprise gatekeeper with metrics)
	handleSystemState,

	// 3. Rate limiting (early protection against abuse)
	handleRateLimit,

	// 4. Application firewall (detect threats Nginx/CDN can't catch)
	handleFirewall,

	// 5. Setup completion enforcement (installation gate with tracking)
	handleSetup,

	// 6. Language preferences (i18n cookie synchronization)
	handleLocale,

	// 7. Theme management (SSR dark mode support)
	handleTheme,

	// 8. Authentication & session management (identity with security monitoring)
	handleAuthentication,

	// 9. Authorization & access control (permissions with threat detection)
	handleAuthorization,

	// 10. API request handling (role-based access control & caching)
	handleApiRequests,

	// 11. Token resolution for API responses
	// CRITICAL: Must be AFTER handleAuthorization (needs locals.user, locals.roles)
	//           and BEFORE addSecurityHeaders (modifies response body)
	handleTokenResolution,

	// 12. Essential security headers (defense in depth)
	addSecurityHeaders,

	// 13. Compression (GZIP/Brotli)
	handleCompression
];

// --- Main Handle Export ---
export const handle: Handle = sequence(...middleware);

// --- Utility Functions for External Use ---
export const getHealthMetrics = () => metricsService.getReport();
export {
	invalidateSessionCache,
	clearAllSessionCaches,
	clearSessionRefreshAttempt,
	forceSessionRotation,
	getSessionCacheStats
} from './hooks/handleAuthentication';
