import { b as building } from './environment.js';
import { error } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { logger } from './logger.js';
import { m as metricsService } from './MetricsService.js';
import {
	m as handleSystemState,
	b as handleRateLimit,
	d as handleFirewall,
	n as handleLocale,
	o as handleTheme,
	h as handleAuthentication,
	p as addSecurityHeaders
} from './handleFirewall.js';
import { a, c, f, g, i } from './handleFirewall.js';
import { handleAuthorization } from './handleAuthorization.js';
import { p as processTokensInResponse } from './helper.js';
import { g as getErrorMessage } from './errorHandling.js';
import { h as hasApiPermission } from './apiPermissions.js';
import { cacheService, API_CACHE_TTL_S } from './CacheService.js';
import { l as logger$1 } from './logger.server.js';
import * as zlib from 'node:zlib';
import { promisify } from 'node:util';
import { T as TokenRegistry } from './engine.js';
import { contentManager } from './ContentManager.js';
import { a as hasPermissionByAction } from './permissions.js';
const handleTokenResolution = async ({ event, resolve }) => {
	const response = await resolve(event);
	const contentType = response.headers.get('content-type');
	const isJson = contentType?.includes('application/json');
	const isApi = event.url.pathname.startsWith('/api/');
	if (!isJson || !isApi) {
		return response;
	}
	if (
		event.url.pathname.startsWith('/api/system') ||
		event.url.pathname.startsWith('/api/dashboard') ||
		event.url.pathname.startsWith('/api/auth') ||
		event.url.pathname.startsWith('/api/graphql')
	) {
		return response;
	}
	try {
		const clonedResponse = response.clone();
		const body = await clonedResponse.json();
		const processed = await processTokensInResponse(body, event.locals.user || void 0, event.locals.contentLanguage || 'en', {
			tenantId: event.locals.tenantId,
			roles: event.locals.roles
			// Add collection context if available in locals (optional optimization)
			// collection: event.locals.collection
		});
		return new Response(JSON.stringify(processed), {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	} catch (error2) {
		logger.error('Token resolution middleware failed', {
			error: error2,
			path: event.url.pathname
		});
		return response;
	}
};
const STATIC_ASSET_REGEX =
	/^\/(?:_app\/|static\/|files\/|favicon\.ico|manifest\.webmanifest|apple-touch-icon.*\.png|robots\.txt|sitemap\.xml)|.*\.(?:js|css|map|svg|png|jpe?g|gif|webp|avif|woff2?|ttf|eot)$/;
const handleStaticAssetCaching = async ({ event, resolve }) => {
	if (STATIC_ASSET_REGEX.test(event.url.pathname)) {
		const response = await resolve(event);
		response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
		return response;
	}
	return resolve(event);
};
function getApiEndpoint(pathname) {
	const parts = pathname.split('/api/')[1]?.split('/');
	return parts?.[0] || null;
}
function generateCacheKey(pathname, search, userId) {
	return `api:${userId}:${pathname}${search}`;
}
function shouldBypassCache(searchParams) {
	return searchParams.get('refresh') === 'true' || searchParams.get('nocache') === 'true';
}
const handleApiRequests = async ({ event, resolve }) => {
	const { url, locals, request } = event;
	if (!url.pathname.startsWith('/api/')) {
		return resolve(event);
	}
	if (url.pathname.startsWith('/api/setup')) {
		return resolve(event);
	}
	if (['/api/system/version', '/api/user/login'].includes(url.pathname)) {
		return resolve(event);
	}
	if (!locals.user) {
		logger$1.warn(`Unauthenticated API access attempt: ${url.pathname}`);
		throw error(401, 'Authentication required');
	}
	metricsService.incrementApiRequests();
	try {
		const apiEndpoint = getApiEndpoint(url.pathname);
		if (!apiEndpoint) {
			logger$1.warn(`Invalid API path: ${url.pathname}`);
			throw error(400, 'Invalid API path');
		}
		if (url.pathname === '/api/user/logout') {
			logger$1.trace('Logout endpoint - bypassing permission checks');
			return resolve(event);
		}
		if (!hasApiPermission(locals.user.role, apiEndpoint)) {
			logger$1.warn(
				`User ${locals.user._id} (role: ${locals.user.role}, tenant: ${locals.tenantId || 'global'}) denied access to /api/${apiEndpoint} - insufficient permissions`
			);
			throw error(403, `Forbidden: Your role (${locals.user.role}) does not have permission to access this API endpoint.`);
		}
		logger$1.trace(`User ${locals.user._id} granted access to /api/${apiEndpoint}`, {
			role: locals.user.role,
			tenant: locals.tenantId || 'global'
		});
		if (request.method === 'GET') {
			const bypassCache = shouldBypassCache(url.searchParams);
			const cacheKey = generateCacheKey(url.pathname, url.search, locals.user._id);
			if (!bypassCache) {
				try {
					const cached = await cacheService.get(cacheKey, locals.tenantId);
					if (cached) {
						logger$1.debug(`Cache hit for API GET ${url.pathname} (tenant: ${locals.tenantId || 'global'})`);
						metricsService.recordApiCacheHit();
						return new Response(JSON.stringify(cached.data), {
							status: 200,
							headers: {
								...cached.headers,
								'Content-Type': 'application/json',
								'X-Cache': 'HIT'
							}
						});
					}
				} catch (cacheError) {
					logger$1.warn(`Cache read error for ${cacheKey}: ${getErrorMessage(cacheError)}`);
				}
			} else {
				logger$1.debug(`Cache bypass requested for ${url.pathname}`);
			}
			const response2 = await resolve(event);
			if (apiEndpoint === 'graphql') {
				response2.headers.set('X-Cache', 'BYPASS');
				metricsService.recordApiCacheMiss();
				return response2;
			}
			if (response2.ok) {
				metricsService.recordApiCacheMiss();
				const responseClone = response2.clone();
				response2.headers.set('X-Cache', 'MISS');
				(async () => {
					try {
						const responseBody = await responseClone.text();
						const responseData = JSON.parse(responseBody);
						await cacheService.set(
							cacheKey,
							{
								data: responseData,
								headers: Object.fromEntries(responseClone.headers)
							},
							API_CACHE_TTL_S,
							locals.tenantId
						);
						logger$1.trace(`Background cache set complete for ${url.pathname}`);
					} catch (processingError) {
						const contentType = responseClone.headers.get('content-type');
						if (contentType?.includes('application/json')) {
							logger$1.error(`Error caching API response for /api/${apiEndpoint}: ${getErrorMessage(processingError)}`);
						} else {
							logger$1.trace(`Skipped caching non-JSON response for /api/${apiEndpoint}`);
						}
					}
				})();
				return response2;
			}
			return response2;
		}
		const response = await resolve(event);
		const isWarmCache = url.pathname.endsWith('/warm-cache');
		if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) && response.ok && !isWarmCache) {
			try {
				const patternToInvalidate = `api:${locals.user._id}:/api/${apiEndpoint}`;
				await cacheService.clearByPattern(`${patternToInvalidate}*`, locals.tenantId);
				logger$1.debug(
					`Invalidated API cache for pattern ${patternToInvalidate}* (tenant: ${locals.tenantId || 'global'}) after ${request.method} request`
				);
			} catch (invalidationError) {
				logger$1.error(`Failed to invalidate API cache after ${request.method}: ${getErrorMessage(invalidationError)}`);
			}
		}
		return response;
	} catch (err) {
		metricsService.incrementApiErrors();
		throw err;
	}
};
const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);
const MIN_COMPRESSION_SIZE = 1024;
const COMPRESSIBLE_TYPES = [
	'text/html',
	'text/css',
	'text/plain',
	'text/xml',
	'application/json',
	'application/javascript',
	'application/xml',
	'image/svg+xml'
];
const handleCompression = async ({ event, resolve }) => {
	const response = await resolve(event);
	if (response.headers.has('Content-Encoding') || !response.body || response.status === 204 || response.status === 304) {
		return response;
	}
	if (event.url.pathname.includes('/__data.json') || response.headers.has('content-length')) {
		return response;
	}
	const contentType = response.headers.get('Content-Type');
	if (!contentType || !COMPRESSIBLE_TYPES.some((t) => contentType.includes(t))) {
		return response;
	}
	const body = await response.arrayBuffer();
	if (body.byteLength < MIN_COMPRESSION_SIZE) {
		return new Response(body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	}
	const acceptEncoding = event.request.headers.get('Accept-Encoding') || '';
	const buffer = Buffer.from(body);
	try {
		if (acceptEncoding.includes('br')) {
			const compressed = await brotli(buffer);
			const headers = Object.fromEntries(response.headers);
			delete headers['Content-Length'];
			delete headers['content-length'];
			return new Response(compressed, {
				headers: {
					...headers,
					'Content-Encoding': 'br',
					'Content-Length': compressed.byteLength.toString(),
					Vary: 'Accept-Encoding'
				},
				status: response.status,
				statusText: response.statusText
			});
		} else if (acceptEncoding.includes('gzip')) {
			const compressed = await gzip(buffer);
			const headers = Object.fromEntries(response.headers);
			delete headers['Content-Length'];
			delete headers['content-length'];
			return new Response(compressed, {
				headers: {
					...headers,
					'Content-Encoding': 'gzip',
					'Content-Length': compressed.byteLength.toString(),
					Vary: 'Accept-Encoding'
				},
				status: response.status,
				statusText: response.statusText
			});
		}
	} catch (error2) {
		console.error('Compression failed:', error2);
		return new Response(body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	}
	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers
	});
};
async function canAccessCollection(user, collectionId, _tenantId, roles) {
	if (!user) return false;
	const userRole = roles?.find((r) => r._id === user.role);
	if (userRole?.isAdmin) return true;
	return hasPermissionByAction(user, 'read', 'collection', collectionId, roles);
}
async function resolveRelationToken(tokenPath, context, user, tenantId) {
	const parts = tokenPath.split('.');
	if (parts.length < 3 || parts[0] !== 'entry') {
		return null;
	}
	const [, relationField, ...nestedPath] = parts;
	const relationData = context.entry?.[relationField];
	if (!relationData) return null;
	const schema = context.collection;
	if (schema) {
		const field = schema.fields.find((f2) => (f2.db_fieldName || f2.label) === relationField);
		if (field?.widget?.Name === 'Relation') {
			const relatedCollectionId = field.widget.collection;
			const hasAccess = await canAccessCollection(user, relatedCollectionId, tenantId, context.roles);
			if (!hasAccess) {
				logger.warn(`Unauthorized relation access attempt: user=${user?._id}, field=${relationField}`);
				return '[Access Denied]';
			}
		}
	}
	let value = relationData;
	for (const key of nestedPath) {
		if (Array.isArray(value)) {
			value = value[0];
		}
		value = value?.[key];
		if (value === void 0 || value === null) break;
	}
	return value;
}
async function getRelationTokens(schema, user, tenantId, roles) {
	const tokens = [];
	const relationFields = schema.fields.filter((field) => field.widget?.Name === 'Relation');
	for (const field of relationFields) {
		const fieldName = field.db_fieldName || field.label;
		const widget = field.widget;
		const relatedCollection = widget?.collection;
		if (!fieldName || !relatedCollection) continue;
		const hasAccess = await canAccessCollection(user, relatedCollection, tenantId, roles);
		if (!hasAccess) {
			logger.debug(`User ${user?._id} denied access to relation ${fieldName} → ${relatedCollection}`);
			continue;
		}
		try {
			const relatedSchema = await contentManager.getCollectionById(relatedCollection, tenantId);
			if (!relatedSchema) continue;
			const displayField = widget?.display_field || 'title';
			tokens.push({
				token: `entry.${fieldName}.${displayField}`,
				name: `${field.label || fieldName} → ${displayField}`,
				category: 'entry',
				type: 'string',
				description: `Related ${relatedSchema.label || relatedSchema.name}: ${displayField} field`,
				example: `{{entry.${fieldName}.${displayField}}}`,
				requiresPermission: `read:collection:${relatedCollection}`,
				resolve: async (ctx) => {
					const relationData = ctx.entry?.[fieldName];
					if (!relationData) return '';
					if (Array.isArray(relationData)) {
						return relationData[0]?.[displayField] || '';
					}
					return relationData[displayField] || '';
				}
			});
			for (const relField of relatedSchema.fields) {
				const relFieldName = relField.db_fieldName || relField.label;
				if (!relFieldName || relFieldName === displayField) continue;
				if (relFieldName.toLowerCase().includes('password')) continue;
				tokens.push({
					token: `entry.${fieldName}.${relFieldName}`,
					name: `${field.label || fieldName} → ${relField.label || relFieldName}`,
					category: 'entry',
					type: getFieldType(relField),
					description: `Related ${relatedSchema.label || relatedSchema.name}: ${relField.helper || relFieldName}`,
					example: `{{entry.${fieldName}.${relFieldName}}}`,
					requiresPermission: `read:collection:${relatedCollection}`,
					resolve: async (ctx) => {
						const relationData = ctx.entry?.[fieldName];
						if (!relationData) return '';
						if (Array.isArray(relationData)) {
							return relationData[0]?.[relFieldName] || '';
						}
						return relationData[relFieldName] || '';
					}
				});
			}
			if (widget?.multiple) {
				tokens.push({
					token: `entry.${fieldName}.count`,
					name: `${field.label || fieldName} → Count`,
					category: 'entry',
					type: 'number',
					description: `Number of related ${relatedSchema.label || relatedSchema.name} items`,
					example: `{{entry.${fieldName}.count}}`,
					requiresPermission: `read:collection:${relatedCollection}`,
					resolve: async (ctx) => {
						const relationData = ctx.entry?.[fieldName];
						if (!relationData) return 0;
						return Array.isArray(relationData) ? relationData.length : 1;
					}
				});
				tokens.push({
					token: `entry.${fieldName}.all`,
					name: `${field.label || fieldName} → All Items`,
					category: 'entry',
					type: 'string',
					description: `Comma-separated list of all related ${relatedSchema.label || relatedSchema.name}`,
					example: `{{entry.${fieldName}.all | truncate(100)}}`,
					requiresPermission: `read:collection:${relatedCollection}`,
					resolve: async (ctx) => {
						const relationData = ctx.entry?.[fieldName];
						if (!relationData) return '';
						if (Array.isArray(relationData)) {
							return relationData
								.map((item) => item[displayField] || item._id)
								.filter(Boolean)
								.join(', ');
						}
						return relationData[displayField] || '';
					}
				});
			}
		} catch (error2) {
			logger.error(`Failed to load relation schema for ${relatedCollection}:`, error2);
		}
	}
	return tokens;
}
function getFieldType(field) {
	const widgetName = field.widget?.Name;
	const typeMap = {
		Checkbox: 'boolean',
		Date: 'date',
		Number: 'number',
		Currency: 'number',
		Rating: 'number',
		Input: 'string',
		RichText: 'string',
		Email: 'string'
	};
	return typeMap[widgetName || ''] || 'string';
}
if (!building) {
	import('./db.js')
		.then((n) => n.e)
		.then(async () => {
			logger.info('📦 [SveltyCMS] Database initialized. Performing application-side service injection...');
			try {
				const { ContentManager } = await import('./ContentManager.js');
				const { configService } = await import('./index2.js');
				const contentManager2 = ContentManager.getInstance();
				configService.setContentManager(contentManager2);
				const { widgetRegistryService } = await import('./WidgetRegistryService.js');
				const { coreModules, customModules } = await import('./scanner.js').then((n) => n.s);
				for (const [path, module] of Object.entries(coreModules)) {
					const processed = widgetRegistryService.processWidgetModule(path, module, 'core');
					if (processed) {
						widgetRegistryService.registerWidget(processed.name, processed.widgetFn);
					}
				}
				for (const [path, module] of Object.entries(customModules)) {
					const processed = widgetRegistryService.processWidgetModule(path, module, 'custom');
					if (processed) {
						widgetRegistryService.registerWidget(processed.name, processed.widgetFn);
					}
				}
				logger.info('✅ [SveltyCMS] Application services initialized and injected.');
			} catch (err) {
				logger.error('❌ [SveltyCMS] Failed to initialize application services in hooks:', err);
			}
		});
	TokenRegistry.setRelationTokenGenerator(getRelationTokens);
	TokenRegistry.setRelationResolver(resolveRelationToken);
	import('./setupCheck.js').then(({ isSetupComplete }) => {
		if (!isSetupComplete()) return;
		const globalWithTelemetry = globalThis;
		if (globalWithTelemetry.__SVELTY_TELEMETRY_INTERVAL__) {
			logger.debug('Reusing existing telemetry interval (HMR detected)');
			return;
		}
		logger.info('📡 Initializing Telemetry Service...');
		import('./TelemetryService.js').then(({ telemetryService }) => {
			setTimeout(() => {
				telemetryService.checkUpdateStatus().catch((err) => {
					console.error('[Telemetry] Initial check failed:', err);
				});
			}, 1e4);
			globalWithTelemetry.__SVELTY_TELEMETRY_INTERVAL__ = setInterval(
				() => {
					telemetryService.checkUpdateStatus().catch((err) => logger.error('Periodic telemetry check failed', err));
				},
				1e3 * 60 * 60 * 12
			);
		});
	});
	logger.info('✅ DB module loaded. System will initialize on first request via handleSystemState.');
}
const middleware = [
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
const handle = sequence(...middleware);
const getHealthMetrics = () => metricsService.getReport();
export {
	a as clearAllSessionCaches,
	c as clearSessionRefreshAttempt,
	f as forceSessionRotation,
	getHealthMetrics,
	g as getSessionCacheStats,
	handle,
	i as invalidateSessionCache
};
//# sourceMappingURL=hooks.server.js.map
