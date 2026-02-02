/**
 * @file src/routes/api/icon-proxy/[...path]/+server.ts
 * @description
 * **Icon Proxy API Endpoint**
 *
 * **Purpose:** Securely fetch 3rd-party icons through server-side proxy to comply with CSP.
 *
 * **Security:**
 * - Validates icon source against allowlist
 * - Prevents SSRF attacks by restricting allowed domains
 * - Caches responses to reduce external requests
 * - Sets appropriate CORS and cache headers
 *
 * **Usage:**
 * <img src="/api/icon-proxy/simpleicons/github" alt="GitHub" />
 * <img src="/api/icon-proxy/iconify/mdi:account" alt="Account" />
 *
 * @example
 * GET /api/icon-proxy/simpleicons/github
 * → Proxies to https://cdn.simpleicons.org/github
 *
 * GET /api/icon-proxy/iconify/mdi:account
 * → Proxies to https://api.iconify.design/mdi/account.svg
 */

// import { error } from '@sveltejs/kit'; // Removed

// Allowlist of trusted icon providers
const ALLOWED_PROVIDERS = {
	simpleicons: {
		baseUrl: 'https://cdn.simpleicons.org',
		// Maps: /api/icon-proxy/simpleicons/github → https://cdn.simpleicons.org/github
		transform: (path: string) => `${path}`
	},
	iconify: {
		baseUrl: 'https://api.iconify.design',
		// Maps: /api/icon-proxy/iconify/mdi:account → https://api.iconify.design/mdi/account.svg
		transform: (path: string) => {
			const [collection, icon] = path.split(':');
			return `${collection}/${icon}.svg`;
		}
	}
	// Add more providers as needed:
	// lucide: { baseUrl: 'https://unpkg.com/lucide-static@latest/icons', transform: (path) => `${path}.svg` },
	// heroicons: { baseUrl: 'https://cdn.jsdelivr.net/npm/heroicons@2.0.18/24/outline', transform: (path) => `${path}.svg` }
} as const;

type ProviderKey = keyof typeof ALLOWED_PROVIDERS;

// Simple in-memory cache (consider Redis for production multi-instance deployments)
const iconCache = new Map<string, { data: Response; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

export const GET = apiHandler(async ({ params, fetch }) => {
	const fullPath = params.path; // e.g., "simpleicons/github" or "iconify/mdi:account"

	if (!fullPath) {
		throw new AppError('Icon path is required', 400, 'PATH_REQUIRED');
	}

	// Parse provider and icon path
	const [provider, ...iconPathParts] = fullPath.split('/');
	const iconPath = iconPathParts.join('/');

	// Validate provider
	if (!provider || !(provider in ALLOWED_PROVIDERS)) {
		throw new AppError(`Invalid icon provider. Allowed: ${Object.keys(ALLOWED_PROVIDERS).join(', ')}`, 400, 'INVALID_PROVIDER');
	}

	if (!iconPath) {
		throw new AppError('Icon path is required', 400, 'PATH_REQUIRED');
	}

	const providerConfig = ALLOWED_PROVIDERS[provider as ProviderKey];
	const cacheKey = `${provider}:${iconPath}`;

	// Check cache first
	const cached = iconCache.get(cacheKey);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.data.clone(); // Clone to avoid consuming the Response body
	}

	// Build external URL
	const transformedPath = providerConfig.transform(iconPath);
	const externalUrl = `${providerConfig.baseUrl}/${transformedPath}`;

	try {
		// Fetch icon from external provider
		const response = await fetch(externalUrl, {
			headers: {
				'User-Agent': 'SveltyCMS-IconProxy/1.0'
			}
		});

		if (!response.ok) {
			throw new AppError(`Failed to fetch icon from ${provider}`, response.status, 'FETCH_FAILED');
		}

		// Determine content type (default to SVG if not provided)
		const contentType = response.headers.get('content-type') || 'image/svg+xml';

		// Read response body
		const iconData = await response.arrayBuffer();

		// Create new Response for caching and returning
		const cachedResponse = new Response(iconData, {
			status: 200,
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=86400', // Client-side cache for 24 hours
				'Access-Control-Allow-Origin': '*', // Allow CORS for icons
				'X-Content-Type-Options': 'nosniff'
			}
		});

		// Store in cache
		iconCache.set(cacheKey, {
			data: cachedResponse.clone(),
			timestamp: Date.now()
		});

		return cachedResponse;
	} catch (err) {
		console.error(`[Icon Proxy] Failed to fetch ${externalUrl}:`, err);
		if (err instanceof AppError) throw err;
		throw new AppError('Failed to fetch icon from external provider', 502, 'UPSTREAM_ERROR');
	}
});

/**
 * **Migration Guide:**
 *
 * Replace direct external icon URLs with proxy URLs:
 *
 * **Before:**
 * ```svelte
 * <img src="https://cdn.simpleicons.org/github" alt="GitHub" />
 * ```
 *
 * **After:**
 * ```svelte
 * <img src="/api/icon-proxy/simpleicons/github" alt="GitHub" />
 * ```
 *
 * **Benefits:**
 * - CSP compliance (no external image sources needed)
 * - Centralized icon loading with caching
 * - SSRF attack prevention via allowlist
 * - Easier icon provider migration (change config, not components)
 */
