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
import { logger } from '@shared/utils/logger';
import { metricsService } from '@shared/services/MetricsService';

// --- Import enterprise middleware hooks ---
import { handleSystemState } from '@cms/hooks/handleSystemState';
import { handleAuthentication } from '@cms/hooks/handleAuthentication';
import { handleAuthorization } from '@cms/hooks/handleAuthorization';
import { handleLocale } from '@cms/hooks/handleLocale';
import { handleTheme } from '@cms/hooks/handleTheme';
import { addSecurityHeaders } from '@cms/hooks/addSecurityHeaders';
import { handleTokenResolution } from '@cms/hooks/tokenResolution';
import { handleStaticAssetCaching } from '@cms/hooks/handleStaticAssetCaching';
import { handleRateLimit } from '@cms/hooks/handleRateLimit';
import { handleFirewall } from '@cms/hooks/handleFirewall';
// API middleware for role-based access control and caching
import { handleApiRequests } from '@cms/hooks/handleApiRequests';
import { handleCompression } from '@cms/hooks/handleCompression';

// --- Import Token Services for Dependency Injection ---
import { TokenRegistry } from '@shared/services/token/engine';
import { getRelationTokens } from './services/token/relationEngine';
import { resolveRelationToken } from './services/token/relationResolver';

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
	import('@shared/database/db').then(async () => {
		logger.info('📦 [SveltyCMS] Database initialized. Performing application-side service injection...');

		try {
			// 1. Initialize ContentManager and inject into ConfigService
			const { ContentManager } = await import('@content/ContentManager');
			const { configService } = await import('@shared/services');
			const contentManager = ContentManager.getInstance();
			configService.setContentManager(contentManager as any);

			// 2. Register Widgets in WidgetRegistryService
			const { widgetRegistryService } = await import('@shared/services/WidgetRegistryService');
			const { coreModules, customModules } = await import('@widgets/scanner');

			// Register core widgets
			for (const [path, module] of Object.entries(coreModules)) {
				const processed = widgetRegistryService.processWidgetModule(path, module as any, 'core');
				if (processed) {
					widgetRegistryService.registerWidget(processed.name, processed.widgetFn);
				}
			}

			// Register custom widgets
			for (const [path, module] of Object.entries(customModules)) {
				const processed = widgetRegistryService.processWidgetModule(path, module as any, 'custom');
				if (processed) {
					widgetRegistryService.registerWidget(processed.name, processed.widgetFn);
				}
			}

			logger.info('✅ [SveltyCMS] Application services initialized and injected.');
		} catch (err) {
			logger.error('❌ [SveltyCMS] Failed to initialize application services in hooks:', err);
		}
	});

	// Inject server-side relation engine into TokenRegistry
	TokenRegistry.setRelationTokenGenerator(getRelationTokens);
	TokenRegistry.setRelationResolver(resolveRelationToken);

	// Start telemetry heartbeat in background (Singleton pattern to survive HMR)
	import('@shared/utils/setupCheck').then(({ isSetupComplete }) => {
		if (!isSetupComplete()) return;

		// Define global type for TypeScript
		const globalWithTelemetry = globalThis as typeof globalThis & {
			__SVELTY_TELEMETRY_INTERVAL__?: NodeJS.Timeout;
		};

		// Prevent duplicate intervals during Hot Module Replacement (HMR)
		if (globalWithTelemetry.__SVELTY_TELEMETRY_INTERVAL__) {
			logger.debug('Reusing existing telemetry interval (HMR detected)');
			return;
		}

		logger.info('📡 Initializing Telemetry Service...');

		// Background Services (Telemetry) - Non-blocking
		import('@shared/services/TelemetryService').then(({ telemetryService }) => {
			// Run initial check after a short delay
			setTimeout(() => {
				telemetryService.checkUpdateStatus().catch((err) => {
					console.error('[Telemetry] Initial check failed:', err);
				});
			}, 10000);

			// Schedule periodic checks (12 hours) and store ID in global
			globalWithTelemetry.__SVELTY_TELEMETRY_INTERVAL__ = setInterval(
				() => {
					telemetryService.checkUpdateStatus().catch((err) => logger.error('Periodic telemetry check failed', err));
				},
				1000 * 60 * 60 * 12
			);
		});
	});

	logger.info('✅ DB module loaded. System will initialize on first request via handleSystemState.');
}

// --- Middleware Sequence ---
const middleware: Handle[] = [
	// 0. Compression (GZIP/Brotli) - Outer layer to compress final processed responses
	handleCompression,

	// 1. Static assets FIRST (skip all other processing for maximum performance)
	handleStaticAssetCaching,

	// 2. System state validation (enterprise gatekeeper with metrics)
	handleSystemState,

	// 3. Rate limiting (early protection against abuse)
	handleRateLimit,

	// 4. Application firewall (detect threats Nginx/CDN can't catch)
	handleFirewall,

	// 5. Language preferences (i18n cookie synchronization)
	handleLocale,

	// 6. Theme management (SSR dark mode support)
	handleTheme,

	// 7. Authentication & session management (identity with security monitoring)
	handleAuthentication,

	// 8. Authorization & access control (permissions with threat detection)
	handleAuthorization,

	// 9. API request handling (role-based access control & caching)
	handleApiRequests,

	// 10. Token resolution for API responses
	// CRITICAL: Must be AFTER handleAuthorization (needs locals.user, locals.roles)
	//           and BEFORE addSecurityHeaders (modifies response body)
	handleTokenResolution,

	// 11. Essential security headers (defense in depth)
	addSecurityHeaders
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
} from '@cms/hooks/handleAuthentication';
