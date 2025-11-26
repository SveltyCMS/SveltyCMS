/**
 * @file static/service-worker.js
 * @description Service Worker for advanced caching and offline support
 *
 * Features:
 * - Static asset caching (CSS, JS, fonts, images)
 * - Runtime caching with cache-first strategy for immutable chunks
 * - Network-first strategy for API calls
 * - Automatic cache cleanup
 * - Background sync support
 *
 * @version 1.0.0
 */

const CACHE_VERSION = 'sveltycms-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Assets to cache on install
const STATIC_ASSETS = ['/', '/Default_User.svg', '/SveltyCMS_Logo.svg', '/robots.txt'];

// Cache size limits (number of entries)
const CACHE_LIMITS = {
	[RUNTIME_CACHE]: 50,
	[API_CACHE]: 30
};

/**
 * Install event - cache static assets
 */
self.addEventListener('install', (event) => {
	console.log('[ServiceWorker] Installing...');

	event.waitUntil(
		caches
			.open(STATIC_CACHE)
			.then((cache) => {
				console.log('[ServiceWorker] Caching static assets');
				return cache.addAll(STATIC_ASSETS);
			})
			.then(() => self.skipWaiting())
	);
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
	console.log('[ServiceWorker] Activating...');

	event.waitUntil(
		caches
			.keys()
			.then((cacheNames) => {
				return Promise.all(
					cacheNames
						.filter((name) => name.startsWith('sveltycms-') && !name.startsWith(CACHE_VERSION))
						.map((name) => {
							console.log('[ServiceWorker] Deleting old cache:', name);
							return caches.delete(name);
						})
				);
			})
			.then(() => self.clients.claim())
	);
});

/**
 * Fetch event - handle caching strategies
 */
self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);

	// Skip non-GET requests
	if (request.method !== 'GET') {
		return;
	}

	// Skip chrome extensions and other origins
	if (!url.origin.includes(self.location.origin)) {
		return;
	}

	// API requests - network first, cache fallback
	if (url.pathname.startsWith('/api/')) {
		event.respondWith(networkFirstStrategy(request, API_CACHE));
		return;
	}

	// Immutable chunks (_app/immutable/*) - cache first
	if (url.pathname.includes('/_app/immutable/')) {
		event.respondWith(cacheFirstStrategy(request, RUNTIME_CACHE));
		return;
	}

	// Static assets - cache first
	if (isStaticAsset(url.pathname)) {
		event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
		return;
	}

	// Everything else - network first
	event.respondWith(networkFirstStrategy(request, RUNTIME_CACHE));
});

/**
 * Cache-first strategy: Check cache, fallback to network
 */
async function cacheFirstStrategy(request, cacheName) {
	try {
		const cache = await caches.open(cacheName);
		const cached = await cache.match(request);

		if (cached) {
			return cached;
		}

		const response = await fetch(request);

		// Cache successful responses
		if (response.ok) {
			cache.put(request, response.clone());
			trimCache(cacheName);
		}

		return response;
	} catch (error) {
		console.error('[ServiceWorker] Cache-first strategy failed:', error);
		return new Response('Offline', { status: 503 });
	}
}

/**
 * Network-first strategy: Try network, fallback to cache
 */
async function networkFirstStrategy(request, cacheName) {
	try {
		const response = await fetch(request);

		// Cache successful responses
		if (response.ok) {
			const cache = await caches.open(cacheName);
			cache.put(request, response.clone());
			trimCache(cacheName);
		}

		return response;
	} catch {
		// Network failed, try cache
		const cache = await caches.open(cacheName);
		const cached = await cache.match(request);

		if (cached) {
			return cached;
		}

		return new Response('Offline', { status: 503 });
	}
}

/**
 * Trim cache to limit
 */
async function trimCache(cacheName) {
	if (!CACHE_LIMITS[cacheName]) return;

	const cache = await caches.open(cacheName);
	const keys = await cache.keys();

	if (keys.length > CACHE_LIMITS[cacheName]) {
		// Delete oldest entries
		const toDelete = keys.slice(0, keys.length - CACHE_LIMITS[cacheName]);
		await Promise.all(toDelete.map((key) => cache.delete(key)));
	}
}

/**
 * Check if path is a static asset
 */
function isStaticAsset(pathname) {
	const staticExtensions = ['.css', '.js', '.woff', '.woff2', '.ttf', '.eot', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif'];
	return staticExtensions.some((ext) => pathname.endsWith(ext));
}

/**
 * Message handler for cache control
 */
self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}

	if (event.data && event.data.type === 'CLEAR_CACHE') {
		event.waitUntil(
			caches.keys().then((cacheNames) => {
				return Promise.all(cacheNames.filter((name) => name.startsWith('sveltycms-')).map((name) => caches.delete(name)));
			})
		);
	}
});
