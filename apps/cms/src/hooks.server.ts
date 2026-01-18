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

			// 2. Register all compiled collections in database adapter
			try {
				const { dbAdapter } = await import('@shared/database/db');
				if (dbAdapter?.collection) {
					// Initialize Widget Registry first (Required for schema processing)
					logger.info('🧩 Initializing Widget Registry for schema processing...');
					const { widgetRegistryService } = await import('@cms/services/WidgetRegistryService');
					const { allWidgetModules } = await import('@cms/widgets/scanner');

					for (const [path, module] of Object.entries(allWidgetModules)) {
						const type = path.includes('/core/') ? 'core' : 'custom';
						const processed = widgetRegistryService.processWidgetModule(path, module, type as 'core' | 'custom');
						if (processed) {
							widgetRegistryService.registerWidget(processed.name, processed.widgetFn);
						}
					}
					logger.debug(`Registered ${widgetRegistryService.getAllWidgets().size} widgets.`);

					logger.info('📚 Registering compiled collections in database...');

					// Scan compiled collections
					const { scanCompiledCollections } = await import('@content/collectionScanner');
					const compiledCollections = await scanCompiledCollections();

					logger.debug(`Found ${compiledCollections.length} compiled collections to register`);

					// Register each collection in the database adapter
					// AND gather updates for the system_content_structure (Categories + Collections)
					const structureUpdates = [];

					// Dynamic import for utils
					const { generateCategoryNodesFromPaths } = await import('@content/utils');

					// 1. Generate Category Nodes from paths
					const categoriesMap = generateCategoryNodesFromPaths(compiledCollections);
					const pathIdMap = new Map<string, string>();

					// 2. Fetch existing categories to reuse IDs (preserve stability)
					try {
						const existingStructure = await dbAdapter.content.nodes.getStructure('flat', { nodeType: 'category' }, true);
						if (existingStructure.success) {
							for (const node of existingStructure.data) {
								if (node.path) pathIdMap.set(node.path, node._id);
							}
						}
					} catch (e) {
						logger.warn('Failed to fetch existing categories:', e);
					}

					// 3. Prepare Category Updates
					for (const [path, node] of categoriesMap.entries()) {
						let categoryId = pathIdMap.get(path);
						if (!categoryId) {
							categoryId = dbAdapter.utils.generateId();
							pathIdMap.set(path, categoryId);
						}

						// Calculate parentId for category (for nested folders)
						// path is e.g. "/Folder/Subfolder" -> parent is "/Folder"
						const parts = path.split('/').filter(Boolean);
						parts.pop(); // remove self
						const parentPath = parts.length > 0 ? '/' + parts.join('/') : null;
						const parentId = parentPath ? pathIdMap.get(parentPath) : null;

						structureUpdates.push({
							path,
							changes: {
								_id: categoryId,
								name: node.name,
								nodeType: 'category',
								parentId: parentId
								// Ensure we don't overwrite other fields if they exist?
								// upsert handles logical merge if we passed just Partial, but bulkUpdate might replace entire sub-doc if not careful?
								// bulkUpdate uses $set: { ...changes }. So it merges.
							}
						});
					}

					// 4. Prepare Collection Updates
					for (const collection of compiledCollections) {
						try {
							// Register Model
							await dbAdapter.collection.createModel(collection);

							// Prepare Content Node
							let cleanPath = collection.path || collection.name || '';
							if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;

							// Determine Parent Category ID
							const parts = cleanPath.split('/').filter(Boolean);
							parts.pop(); // remove collection name
							const parentPath = parts.length > 0 ? '/' + parts.join('/') : null;
							const parentId = parentPath ? pathIdMap.get(parentPath) : null;

							structureUpdates.push({
								path: cleanPath,
								changes: {
									_id: collection._id,
									name: collection.name || 'Unnamed Collection',
									slug: collection.slug,
									nodeType: 'collection',
									icon: collection.icon,
									order: collection.order || 0,
									collectionDef: collection,
									description: collection.description,
									translations: collection.translations || [],
									parentId: parentId // Link to category
								}
							});

							logger.debug(`✅ Registered model: ${collection.name}`);
						} catch (collectionError) {
							logger.warn(`Failed to register collection ${collection.name}:`, collectionError);
						}
					}

					// 5. Batch Sync to System Content Structure
					// 5. Batch Sync to System Content Structure
					if (structureUpdates.length > 0) {
						try {
							await dbAdapter.content.nodes.bulkUpdate(structureUpdates as any);
							logger.info(`✅ Synced ${structureUpdates.length} nodes (categories + collections) to content structure`);

							// Force refresh ContentManager cache so it picks up the newly synced structure
							// This prevents the race condition where ContentManager initialized with empty DB
							logger.info('🔄 Refreshing ContentManager cache...');
							await contentManager.refresh();
							logger.info('✅ ContentManager cache refreshed');

							// Verification
							try {
								const dbCheck = await dbAdapter.content.nodes.getStructure('flat', {}, true);
								if (dbCheck.success) {
									logger.info(`🔍 Post-sync DB Check: Found ${dbCheck.data.length} nodes`);
								} else {
									logger.warn(`🔍 Post-sync DB Check: Failed to verify nodes: ${dbCheck.message}`);
								}

								const cmCheck = await contentManager.getContentStructure();
								logger.info(`🔍 Post-sync CM Check: Found ${cmCheck.length} nodes`);
							} catch (e) {
								logger.error('Verification failed:', e);
							}
						} catch (syncError) {
							logger.error('Failed to sync content structure:', syncError);
						}
					}

					logger.info(`✅ Registered ${compiledCollections.length} collections in database`);
				} else {
					logger.warn('Database adapter collections interface not available - skipping collection registration');
				}
			} catch (collectionRegError) {
				logger.error('Failed to register collections:', collectionRegError);
				// Don't throw - allow system to continue even if collection registration fails
			}

			// 3. Register Widgets in WidgetRegistryService
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
